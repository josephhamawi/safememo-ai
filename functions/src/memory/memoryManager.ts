import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type {
  WorkingMemory,
  SemanticMemory,
  StagingMemory,
  EpisodicMemory,
  Message,
} from '../types';

const db = () => getFirestore();

// ============================================================
// Collection path helpers
// ============================================================

const paths = {
  workingMemory: (agentId: string) =>
    `agents/${agentId}/workingMemory`,
  semanticMemory: (agentId: string) =>
    `agents/${agentId}/semanticMemory`,
  stagingMemory: (agentId: string) =>
    `agents/${agentId}/stagingMemory`,
  rejectedMemory: (agentId: string) =>
    `agents/${agentId}/rejectedMemory`,
  episodicMemory: (agentId: string) =>
    `agents/${agentId}/episodicMemory`,
  notifications: (userId: string) =>
    `users/${userId}/notifications`,
} as const;

// ============================================================
// L1 - Working Memory Operations
// ============================================================

const WORKING_MEMORY_TTL_HOURS = 24;

/**
 * Create a fresh working-memory session with a 24-hour TTL.
 */
export async function createWorkingMemory(
  agentId: string,
  sessionId: string,
  userId: string,
  deviceId: string,
): Promise<WorkingMemory> {
  const now = Timestamp.now();
  const ttl = Timestamp.fromMillis(
    now.toMillis() + WORKING_MEMORY_TTL_HOURS * 60 * 60 * 1000,
  );

  const wm: WorkingMemory = {
    sessionId,
    agentId,
    userId,
    contextWindow: [],
    activeTools: [],
    tempVariables: {},
    ttl,
    deviceId,
    syncStatus: 'local',
    createdAt: now,
    updatedAt: now,
  };

  await db()
    .collection(paths.workingMemory(agentId))
    .doc(sessionId)
    .set(wm);

  logger.info('Working memory created', { agentId, sessionId });
  return wm;
}

/**
 * Retrieve the working memory for a given session.
 */
export async function getWorkingMemory(
  agentId: string,
  sessionId: string,
): Promise<WorkingMemory | null> {
  const snap = await db()
    .collection(paths.workingMemory(agentId))
    .doc(sessionId)
    .get();

  if (!snap.exists) {
    return null;
  }

  const wm = snap.data() as WorkingMemory;

  // Check TTL expiry
  if (wm.ttl.toMillis() < Date.now()) {
    logger.info('Working memory expired, cleaning up', { agentId, sessionId });
    await db()
      .collection(paths.workingMemory(agentId))
      .doc(sessionId)
      .delete();
    return null;
  }

  return wm;
}

/**
 * Append a message and optionally update tools / temp variables.
 * Refreshes the TTL on every update.
 */
export async function updateWorkingMemory(
  agentId: string,
  sessionId: string,
  update: {
    message?: Message;
    activeTools?: string[];
    tempVariables?: Record<string, unknown>;
  },
): Promise<void> {
  const ref = db()
    .collection(paths.workingMemory(agentId))
    .doc(sessionId);

  const newTtl = Timestamp.fromMillis(
    Date.now() + WORKING_MEMORY_TTL_HOURS * 60 * 60 * 1000,
  );

  const updatePayload: Record<string, unknown> = {
    ttl: newTtl,
    updatedAt: Timestamp.now(),
    syncStatus: 'synced',
  };

  if (update.message) {
    updatePayload.contextWindow = FieldValue.arrayUnion(update.message);
  }
  if (update.activeTools) {
    updatePayload.activeTools = update.activeTools;
  }
  if (update.tempVariables) {
    // Merge temp variables at top level
    for (const [k, v] of Object.entries(update.tempVariables)) {
      updatePayload[`tempVariables.${k}`] = v;
    }
  }

  await ref.update(updatePayload);
  logger.debug('Working memory updated', { agentId, sessionId });
}

/**
 * Delete all working-memory sessions whose TTL has expired.
 * Designed to be called by a scheduled function.
 */
export async function cleanupExpiredWorkingMemory(
  agentId: string,
  maxBatchSize = 200,
): Promise<number> {
  const now = Timestamp.now();
  const colRef = db().collection(paths.workingMemory(agentId));
  const expired = await colRef
    .where('ttl', '<', now)
    .limit(maxBatchSize)
    .get();

  if (expired.empty) {
    return 0;
  }

  const batch = db().batch();
  expired.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  logger.info('Cleaned up expired working memory', {
    agentId,
    count: expired.size,
  });
  return expired.size;
}

// ============================================================
// L2 - Semantic Memory Operations
// ============================================================

/**
 * Stage a new semantic memory for validation.
 * Returns the staging document ID.
 */
export async function stageSemanticMemory(
  agentId: string,
  memory: Omit<StagingMemory, 'id' | 'metadata'> & {
    metadata: Omit<StagingMemory['metadata'], 'createdAt' | 'lastAccessed' | 'accessCount' | 'validationStatus'> & {
      validationStatus?: 'staging';
    };
  },
): Promise<string> {
  const now = Timestamp.now();
  const colRef = db().collection(paths.stagingMemory(agentId));
  const docRef = colRef.doc();

  const staging: StagingMemory = {
    ...memory,
    id: docRef.id,
    agentId,
    metadata: {
      ...memory.metadata,
      validationStatus: 'staging',
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
    },
    autoApprovalEligible: false,
  };

  await docRef.set(staging);
  logger.info('Semantic memory staged', { agentId, stagingId: docRef.id });
  return docRef.id;
}

/**
 * Retrieve all approved semantic memories for an agent.
 */
export async function getApprovedMemories(
  agentId: string,
  limit = 100,
): Promise<SemanticMemory[]> {
  const snap = await db()
    .collection(paths.semanticMemory(agentId))
    .orderBy('metadata.lastAccessed', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => doc.data() as SemanticMemory);
}

/**
 * Search semantic memories by metadata filters (tags, source, confidence).
 */
export async function searchSemanticByMetadata(
  agentId: string,
  filters: {
    tags?: string[];
    source?: SemanticMemory['metadata']['source'];
    minConfidence?: number;
  },
  limit = 20,
): Promise<SemanticMemory[]> {
  let query: FirebaseFirestore.Query = db().collection(
    paths.semanticMemory(agentId),
  );

  if (filters.source) {
    query = query.where('metadata.source', '==', filters.source);
  }
  if (filters.minConfidence !== undefined) {
    query = query.where('metadata.confidence', '>=', filters.minConfidence);
  }
  if (filters.tags && filters.tags.length > 0) {
    // Firestore array-contains-any supports up to 30 values
    query = query.where(
      'metadata.tags',
      'array-contains-any',
      filters.tags.slice(0, 30),
    );
  }

  const snap = await query.limit(limit).get();
  return snap.docs.map((doc) => doc.data() as SemanticMemory);
}

/**
 * Increment access count and touch lastAccessed for a memory.
 */
export async function touchSemanticMemory(
  agentId: string,
  memoryId: string,
): Promise<void> {
  await db()
    .collection(paths.semanticMemory(agentId))
    .doc(memoryId)
    .update({
      'metadata.lastAccessed': Timestamp.now(),
      'metadata.accessCount': FieldValue.increment(1),
    });
}

// ============================================================
// L3 - Episodic Memory Operations
// ============================================================

/**
 * Log a new episode to the episodic memory collection.
 */
export async function logEpisode(
  agentId: string,
  episode: Omit<EpisodicMemory, 'episodeId' | 'createdAt'>,
): Promise<string> {
  const colRef = db().collection(paths.episodicMemory(agentId));
  const docRef = colRef.doc();

  const record: EpisodicMemory = {
    ...episode,
    episodeId: docRef.id,
    agentId,
    createdAt: Timestamp.now(),
  };

  await docRef.set(record);
  logger.info('Episode logged', {
    agentId,
    episodeId: docRef.id,
    domain: episode.taskDomain,
  });
  return docRef.id;
}

/**
 * Query episodes by task domain.
 */
export async function queryEpisodesByDomain(
  agentId: string,
  taskDomain: string,
  limit = 20,
): Promise<EpisodicMemory[]> {
  const snap = await db()
    .collection(paths.episodicMemory(agentId))
    .where('taskDomain', '==', taskDomain)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => doc.data() as EpisodicMemory);
}

/**
 * Retrieve high-consolidation-score episodes (candidates for promotion).
 */
export async function getHighScoreEpisodes(
  agentId: string,
  minScore = 0.8,
  limit = 50,
): Promise<EpisodicMemory[]> {
  const snap = await db()
    .collection(paths.episodicMemory(agentId))
    .where('consolidationScore', '>=', minScore)
    .where('promotedToSemantic', '==', false)
    .orderBy('consolidationScore', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => doc.data() as EpisodicMemory);
}

/**
 * Mark a batch of episodes as promoted to semantic memory.
 */
export async function markEpisodesConsolidated(
  agentId: string,
  episodeIds: string[],
): Promise<void> {
  const colPath = paths.episodicMemory(agentId);
  // Firestore batch limit is 500; chunk if necessary
  const chunks: string[][] = [];
  for (let i = 0; i < episodeIds.length; i += 500) {
    chunks.push(episodeIds.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db().batch();
    for (const eid of chunk) {
      batch.update(db().collection(colPath).doc(eid), {
        promotedToSemantic: true,
      });
    }
    await batch.commit();
  }

  logger.info('Episodes marked as consolidated', {
    agentId,
    count: episodeIds.length,
  });
}

// Re-export paths for use by sibling modules
export { paths };
