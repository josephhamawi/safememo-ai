import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import type { SemanticMemory } from '../types';
import { cosineSimilarity } from './validationGate';
import { paths, touchSemanticMemory } from './memoryManager';

const db = () => getFirestore();

// ============================================================
// Configuration
// ============================================================

const VERTEX_MODEL = 'textembedding-gecko@003';
const EMBEDDING_DIMENSIONS = 768;

/**
 * Resolve the GCP project and location from environment variables.
 * Falls back to the GCLOUD_PROJECT / FIREBASE_CONFIG vars that Cloud Functions
 * makes available automatically.
 */
function getProjectConfig(): { project: string; location: string } {
  const project =
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    (process.env.FIREBASE_CONFIG
      ? JSON.parse(process.env.FIREBASE_CONFIG).projectId
      : undefined);

  if (!project) {
    throw new Error(
      'Cannot determine GCP project ID. Set GCLOUD_PROJECT env var.',
    );
  }

  const location = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
  return { project, location };
}

// Lazy singleton — created on first use so cold-start cost stays low.
let _predictionClient: PredictionServiceClient | null = null;

function getPredictionClient(): PredictionServiceClient {
  if (!_predictionClient) {
    _predictionClient = new PredictionServiceClient({
      apiEndpoint: `${getProjectConfig().location}-aiplatform.googleapis.com`,
    });
  }
  return _predictionClient;
}

// ============================================================
// Embedding Generation
// ============================================================

/**
 * Generate a 768-dimensional embedding vector for the given text using
 * Vertex AI's textembedding-gecko@003 model.
 *
 * Falls back to a zero vector (with a warning) if Vertex AI is unreachable
 * so the caller can degrade gracefully.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { project, location } = getProjectConfig();
    const client = getPredictionClient();

    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/${VERTEX_MODEL}`;

    const instance = {
      structValue: {
        fields: {
          content: { stringValue: text },
        },
      },
    };

    const parameters = {
      structValue: {
        fields: {
          outputDimensionality: {
            numberValue: EMBEDDING_DIMENSIONS,
          },
        },
      },
    };

    const [response] = await client.predict({
      endpoint,
      instances: [instance],
      parameters,
    });

    const predictions = response.predictions;
    if (!predictions || predictions.length === 0) {
      throw new Error('Empty predictions array from Vertex AI');
    }

    const embeddingValues =
      predictions[0]?.structValue?.fields?.embeddings?.structValue?.fields
        ?.values?.listValue?.values;

    if (!embeddingValues) {
      throw new Error('Unexpected response structure from Vertex AI');
    }

    const embedding = embeddingValues.map(
      (v: { numberValue?: number | null }) => v.numberValue ?? 0,
    );

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      logger.warn('Embedding dimension mismatch', {
        expected: EMBEDDING_DIMENSIONS,
        received: embedding.length,
      });
    }

    return embedding;
  } catch (err) {
    logger.error('Vertex AI embedding generation failed, returning fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Array(EMBEDDING_DIMENSIONS).fill(0);
  }
}

// ============================================================
// Firestore-native Vector Search (fallback)
// ============================================================

/**
 * Brute-force vector search over Firestore documents.
 * Used when Vertex AI Vector Search index is unavailable.
 */
async function firestoreVectorSearch(
  agentId: string,
  queryEmbedding: number[],
  topK: number,
  metadataFilters?: MetadataFilters,
): Promise<ScoredMemory[]> {
  let query: FirebaseFirestore.Query = db().collection(
    paths.semanticMemory(agentId),
  );

  // Apply metadata pre-filters to reduce the scan set
  if (metadataFilters?.source) {
    query = query.where('metadata.source', '==', metadataFilters.source);
  }
  if (metadataFilters?.minConfidence !== undefined) {
    query = query.where(
      'metadata.confidence',
      '>=',
      metadataFilters.minConfidence,
    );
  }
  if (metadataFilters?.tags && metadataFilters.tags.length > 0) {
    query = query.where(
      'metadata.tags',
      'array-contains-any',
      metadataFilters.tags.slice(0, 30),
    );
  }

  const snap = await query.limit(500).get();

  const scored: ScoredMemory[] = [];

  for (const doc of snap.docs) {
    const mem = doc.data() as SemanticMemory;
    if (!mem.embedding || mem.embedding.length === 0) continue;

    const score = cosineSimilarity(queryEmbedding, mem.embedding);
    scored.push({ memory: mem, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// ============================================================
// Vertex AI Vector Search (managed index)
// ============================================================

/**
 * Query Vertex AI Vector Search index.
 *
 * This requires a pre-deployed Matching Engine index + endpoint.
 * If the environment variables are not set the function falls back
 * to the Firestore-native brute-force search.
 */
async function vertexVectorSearch(
  agentId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<ScoredMemory[] | null> {
  const indexEndpoint = process.env.VERTEX_VECTOR_SEARCH_ENDPOINT;
  const deployedIndexId = process.env.VERTEX_DEPLOYED_INDEX_ID;

  if (!indexEndpoint || !deployedIndexId) {
    // Vertex Vector Search not configured — signal fallback
    return null;
  }

  try {
    const { project, location } = getProjectConfig();
    const client = getPredictionClient();

    // The MatchService shares the same client library
    const endpoint = `projects/${project}/locations/${location}/indexEndpoints/${indexEndpoint}`;

    // Build the findNeighbors request through the REST-compatible predict path.
    // Note: the official Node SDK for Matching Engine uses the MatchServiceClient,
    // but we stay within PredictionServiceClient for simplicity.  A production
    // deployment would use MatchServiceClient.findNeighbors directly.
    const [response] = await client.predict({
      endpoint,
      instances: [
        {
          structValue: {
            fields: {
              featureVector: {
                listValue: {
                  values: queryEmbedding.map((v) => ({ numberValue: v })),
                },
              },
              neighborCount: { numberValue: topK },
              // Restrict to this agent's memories via namespace
              restricts: {
                listValue: {
                  values: [
                    {
                      structValue: {
                        fields: {
                          namespace: { stringValue: 'agentId' },
                          allowList: {
                            listValue: {
                              values: [{ stringValue: agentId }],
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    });

    const predictions = response.predictions;
    if (!predictions || predictions.length === 0) {
      return null;
    }

    const neighbors =
      predictions[0]?.structValue?.fields?.neighbors?.listValue?.values ?? [];

    const results: ScoredMemory[] = [];

    for (const neighbor of neighbors) {
      const fields = neighbor.structValue?.fields;
      const memoryId = fields?.datapoint?.structValue?.fields?.datapointId?.stringValue;
      const distance = fields?.distance?.numberValue;

      if (!memoryId) continue;

      // Fetch the full document from Firestore
      const doc = await db()
        .collection(paths.semanticMemory(agentId))
        .doc(memoryId)
        .get();

      if (!doc.exists) continue;

      results.push({
        memory: doc.data() as SemanticMemory,
        score: distance != null ? 1 - distance : 0, // convert distance to similarity
      });
    }

    return results;
  } catch (err) {
    logger.warn('Vertex Vector Search failed, will fall back to Firestore', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ============================================================
// Public API
// ============================================================

export interface ScoredMemory {
  memory: SemanticMemory;
  score: number;
}

export interface MetadataFilters {
  tags?: string[];
  source?: SemanticMemory['metadata']['source'];
  minConfidence?: number;
}

/**
 * Pure semantic search: generate an embedding for the query text and return
 * the top-K most similar approved memories.
 *
 * Attempts Vertex AI Vector Search first; falls back to Firestore-native
 * brute-force search if unavailable.
 */
export async function semanticSearch(
  agentId: string,
  query: string,
  topK = 10,
): Promise<ScoredMemory[]> {
  logger.debug('Running semantic search', { agentId, topK });

  const queryEmbedding = await generateEmbedding(query);

  // Zero-vector check (embedding generation failed)
  const isZero = queryEmbedding.every((v) => v === 0);
  if (isZero) {
    logger.warn(
      'Query embedding is a zero vector; semantic search will return no meaningful results',
      { agentId },
    );
    return [];
  }

  // Try managed Vertex Vector Search first
  const vertexResults = await vertexVectorSearch(agentId, queryEmbedding, topK);
  const results = vertexResults ?? await firestoreVectorSearch(agentId, queryEmbedding, topK);

  // Touch accessed memories to keep recency stats fresh
  const touchPromises = results.map((r) =>
    touchSemanticMemory(agentId, r.memory.id).catch((err) => {
      logger.warn('Failed to touch memory', {
        memoryId: r.memory.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }),
  );
  await Promise.all(touchPromises);

  return results;
}

/**
 * Hybrid search: combine vector similarity with metadata filtering.
 *
 * Metadata filters are applied as Firestore query predicates which prune the
 * candidate set before similarity ranking.  If Vertex Vector Search is available,
 * results are post-filtered (Vertex manages the similarity portion, Firestore
 * handles metadata).
 */
export async function hybridSearch(
  agentId: string,
  query: string,
  filters: MetadataFilters,
  topK = 10,
): Promise<ScoredMemory[]> {
  logger.debug('Running hybrid search', { agentId, filters, topK });

  const queryEmbedding = await generateEmbedding(query);

  const isZero = queryEmbedding.every((v) => v === 0);
  if (isZero) {
    logger.warn(
      'Query embedding is a zero vector; hybrid search will rely on metadata only',
      { agentId },
    );
  }

  // Try Vertex first; if it returns results, post-filter by metadata
  if (!isZero) {
    const vertexResults = await vertexVectorSearch(
      agentId,
      queryEmbedding,
      topK * 3, // over-fetch to allow metadata filtering
    );

    if (vertexResults) {
      const filtered = applyMetadataFilters(vertexResults, filters);
      const topResults = filtered.slice(0, topK);

      await touchResults(agentId, topResults);
      return topResults;
    }
  }

  // Fallback: Firestore-native search with metadata filters baked in
  const results = await firestoreVectorSearch(
    agentId,
    queryEmbedding,
    topK,
    filters,
  );

  await touchResults(agentId, results);
  return results;
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Apply metadata filters to an already-scored result set.
 */
function applyMetadataFilters(
  results: ScoredMemory[],
  filters: MetadataFilters,
): ScoredMemory[] {
  return results.filter((r) => {
    const meta = r.memory.metadata;

    if (filters.source && meta.source !== filters.source) {
      return false;
    }
    if (
      filters.minConfidence !== undefined &&
      meta.confidence < filters.minConfidence
    ) {
      return false;
    }
    if (filters.tags && filters.tags.length > 0) {
      const hasMatchingTag = filters.tags.some((t) => meta.tags.includes(t));
      if (!hasMatchingTag) return false;
    }

    return true;
  });
}

/**
 * Batch-touch accessed memories (fire-and-forget with error suppression).
 */
async function touchResults(
  agentId: string,
  results: ScoredMemory[],
): Promise<void> {
  const promises = results.map((r) =>
    touchSemanticMemory(agentId, r.memory.id).catch((err) => {
      logger.warn('Failed to touch memory after search', {
        memoryId: r.memory.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }),
  );
  await Promise.all(promises);
}
