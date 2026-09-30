/**
 * Embedding generation for semantic memory search.
 *
 * Vertex AI went with the Google Cloud project, and Anthropic has no
 * embeddings API — an Anthropic-only user would otherwise have no vector
 * search at all. Two backends cover it:
 *
 *   local   ONNX bge-base-en-v1.5 in-process. No key, no per-call cost, and
 *           memory content never leaves the machine — which is the point for
 *           a product sold on auditability.
 *   google  The user's own Gemini key via BYOK (text-embedding-004).
 *
 * Both produce 768 dimensions, matching the `vector(768)` column. Anything
 * else is rejected rather than silently truncated, because a mismatched
 * vector poisons every later similarity score.
 */

import { env } from '../env';

export const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingBackend {
  readonly id: 'local' | 'google' | 'none';
  /** Returns one vector per input, in order. */
  embed(texts: string[], ctx: EmbedContext): Promise<number[][]>;
}

export interface EmbedContext {
  /** Needed by key-based backends to fetch the caller's credential. */
  userId: string;
}

export class EmbeddingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

/** Disabled backend. Search falls back to lexical matching. */
const noneBackend: EmbeddingBackend = {
  id: 'none',
  async embed() {
    throw new EmbeddingUnavailableError(
      'Embeddings are disabled (EMBEDDING_PROVIDER=none)',
    );
  },
};

let cached: EmbeddingBackend | undefined;

export async function getBackend(): Promise<EmbeddingBackend> {
  if (cached) return cached;

  switch (env.EMBEDDING_PROVIDER) {
    case 'none':
      cached = noneBackend;
      break;

    case 'google': {
      const { googleBackend } = await import('./google');
      cached = googleBackend;
      break;
    }

    case 'local': {
      const { createLocalBackend } = await import('./local');
      try {
        cached = await createLocalBackend();
      } catch (err) {
        // The usual cause is an unsupported platform: onnxruntime-node ships
        // no darwin/x64 binary, so Intel macOS cannot load it. Degrading to
        // lexical search beats refusing to boot — the operator gets a loud
        // log line and a working server.
        console.error(
          '[embeddings] local backend unavailable, falling back to lexical search:',
          err instanceof Error ? err.message : err,
        );
        console.error(
          '[embeddings] set EMBEDDING_PROVIDER=google to use a Gemini key instead, ' +
            'or run in Docker where the native binary is available',
        );
        cached = noneBackend;
      }
      break;
    }
  }

  return cached;
}

/** True when vector search is actually usable. */
export async function embeddingsEnabled(): Promise<boolean> {
  return (await getBackend()).id !== 'none';
}

/**
 * Embed a batch. Returns null rather than throwing when embeddings are
 * unavailable, so callers can fall back instead of failing the user's request
 * over an optional capability.
 */
export async function tryEmbed(
  texts: string[],
  ctx: EmbedContext,
): Promise<number[][] | null> {
  if (texts.length === 0) return [];

  const backend = await getBackend();
  if (backend.id === 'none') return null;

  try {
    const vectors = await backend.embed(texts, ctx);
    assertShape(vectors, texts.length);
    return vectors;
  } catch (err) {
    console.error('[embeddings] generation failed:', err);
    return null;
  }
}

function assertShape(vectors: number[][], expectedCount: number): void {
  if (vectors.length !== expectedCount) {
    throw new Error(
      `expected ${expectedCount} vectors, got ${vectors.length}`,
    );
  }
  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}`,
      );
    }
    // A zero vector has undefined cosine similarity and would rank randomly.
    // Better to reject the batch than to store a memory that never matches.
    if (vector.every((v) => v === 0)) {
      throw new Error('backend returned a zero vector');
    }
  }
}

/** Postgres `vector` literal. pgvector has no binary param format in `pg`. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
