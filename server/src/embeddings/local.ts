/**
 * In-process embeddings via ONNX (transformers.js).
 *
 * bge-base-en-v1.5 — 768 dimensions, matching the schema. Weights are fetched
 * once on first use (~110 MB) and cached under HF_HOME; pre-warm at boot or
 * bake them into the image to avoid paying that on a user's first message.
 *
 * Native binary support is not universal: onnxruntime-node ships linux
 * x64/arm64, darwin arm64, and win32 x64/arm64 — but not darwin x64. On an
 * Intel Mac this module throws at load and the caller degrades to lexical
 * search. That is why the import is dynamic and confined to this file.
 */

import { EMBEDDING_DIMENSIONS, type EmbeddingBackend } from './index';

const MODEL_ID = 'Xenova/bge-base-en-v1.5';

/** bge models expect this prefix on queries, but not on stored documents. */
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

export async function createLocalBackend(): Promise<EmbeddingBackend> {
  // Dynamic import: a static one would crash the process at startup on any
  // platform without a prebuilt binary.
  const { pipeline, env: hfEnv } = await import('@huggingface/transformers');

  // No remote code execution, and no surprise downloads beyond the model.
  hfEnv.allowLocalModels = true;

  const started = Date.now();
  const extractor = (await pipeline('feature-extraction', MODEL_ID)) as unknown as Extractor;
  console.log(
    `[embeddings] loaded ${MODEL_ID} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  // Prove the model matches the schema before anything is written, rather
  // than discovering a dimension mismatch on the first INSERT.
  const probe = await extractor(['dimension probe'], {
    pooling: 'mean',
    normalize: true,
  });
  const probeDims = probe.tolist()[0]?.length ?? 0;
  if (probeDims !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `${MODEL_ID} produced ${probeDims} dimensions, schema expects ${EMBEDDING_DIMENSIONS}`,
    );
  }

  return {
    id: 'local',
    async embed(texts) {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist();
    },
  };
}

/** Apply the retrieval prefix bge expects on the query side only. */
export function asQuery(text: string): string {
  return QUERY_PREFIX + text;
}
