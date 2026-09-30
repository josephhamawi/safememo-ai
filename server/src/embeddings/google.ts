/**
 * Embeddings via the user's own Gemini key (BYOK).
 *
 * text-embedding-004 returns 768 dimensions natively, matching the schema.
 * Unlike the local backend this sends memory content to a third party, so it
 * is opt-in via EMBEDDING_PROVIDER=google rather than the default.
 */

import { useCredential } from '../providers/credentialStore';
import { EMBEDDING_DIMENSIONS, type EmbeddingBackend } from './index';

const MODEL = 'models/text-embedding-004';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents`;
const TIMEOUT_MS = 20_000;

/** API limit; larger batches are chunked. */
const MAX_BATCH = 100;

interface BatchResponse {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string };
}

export const googleBackend: EmbeddingBackend = {
  id: 'google',

  async embed(texts, ctx) {
    // Decrypted per call and zeroed below — the same discipline the agent
    // loop uses. An embedding run must not leave a key resident.
    const keyBuffer = await useCredential(ctx.userId, 'google');
    const vectors: number[][] = [];

    try {
      const apiKey = keyBuffer.toString('utf8');

      for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
        const chunk = texts.slice(offset, offset + MAX_BATCH);

        const response = await fetch(
          `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: chunk.map((text) => ({
                model: MODEL,
                content: { parts: [{ text }] },
                outputDimensionality: EMBEDDING_DIMENSIONS,
              })),
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );

        const body = (await response.json().catch(() => null)) as BatchResponse | null;

        if (!response.ok) {
          // The upstream message can echo request content, so it is logged
          // rather than surfaced.
          console.error(
            '[embeddings:google] request failed',
            response.status,
            body?.error?.message,
          );
          throw new Error(`Gemini embedding request failed (${response.status})`);
        }

        const embeddings = body?.embeddings ?? [];
        if (embeddings.length !== chunk.length) {
          throw new Error(
            `expected ${chunk.length} embeddings, got ${embeddings.length}`,
          );
        }

        for (const item of embeddings) {
          if (!item.values) throw new Error('embedding response missing values');
          vectors.push(item.values);
        }
      }

      return vectors;
    } finally {
      keyBuffer.fill(0);
    }
  },
};
