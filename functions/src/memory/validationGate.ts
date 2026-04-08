import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type {
  StagingMemory,
  SemanticMemory,
  Notification,
} from '../types';
import { paths } from './memoryManager';

const db = () => getFirestore();

// ============================================================
// Cosine Similarity Helper
// ============================================================

/**
 * Compute the cosine similarity between two equal-length numeric vectors.
 * Returns a value in [-1, 1]; 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }
  return dotProduct / denominator;
}

// ============================================================
// Duplicate Detection
// ============================================================

const DUPLICATE_THRESHOLD = 0.92;

interface DuplicateCheckResult {
  hasDuplicate: boolean;
  similarMemoryId?: string;
  similarityScore?: number;
}

/**
 * Check whether a staging memory is semantically near-identical
 * to an already-approved memory.
 */
async function checkDuplicates(
  agentId: string,
  staging: StagingMemory,
): Promise<DuplicateCheckResult> {
  if (!staging.embedding || staging.embedding.length === 0) {
    return { hasDuplicate: false };
  }

  // Fetch approved memories in the same tag space first for efficiency
  const approvedSnap = await db()
    .collection(paths.semanticMemory(agentId))
    .limit(200) // cap to avoid unbounded reads
    .get();

  let bestScore = 0;
  let bestId: string | undefined;

  for (const doc of approvedSnap.docs) {
    const mem = doc.data() as SemanticMemory;
    if (!mem.embedding || mem.embedding.length === 0) continue;

    const score = cosineSimilarity(staging.embedding, mem.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestId = mem.id;
    }
  }

  if (bestScore >= DUPLICATE_THRESHOLD) {
    return {
      hasDuplicate: true,
      similarMemoryId: bestId,
      similarityScore: bestScore,
    };
  }

  return { hasDuplicate: false };
}

// ============================================================
// Contradiction Detection
// ============================================================

interface ContradictionCheckResult {
  hasContradiction: boolean;
  conflictingMemoryId?: string;
  explanation?: string;
}

/**
 * Simple contradiction heuristic: find high-similarity memories
 * in the 0.7-0.91 range (same topic but NOT duplicate) and flag
 * them if confidence values diverge significantly or tags overlap
 * but content differs.
 *
 * A production system would call an LLM here; this implementation
 * provides a fast structural check.
 */
async function checkContradictions(
  agentId: string,
  staging: StagingMemory,
): Promise<ContradictionCheckResult> {
  if (!staging.embedding || staging.embedding.length === 0) {
    return { hasContradiction: false };
  }

  const approvedSnap = await db()
    .collection(paths.semanticMemory(agentId))
    .limit(200)
    .get();

  for (const doc of approvedSnap.docs) {
    const mem = doc.data() as SemanticMemory;
    if (!mem.embedding || mem.embedding.length === 0) continue;

    const score = cosineSimilarity(staging.embedding, mem.embedding);

    // Same topic range but not duplicate
    if (score >= 0.7 && score < DUPLICATE_THRESHOLD) {
      // Overlapping tags suggest same topic
      const sharedTags = staging.metadata.tags.filter((t) =>
        mem.metadata.tags.includes(t),
      );

      if (sharedTags.length > 0) {
        // Content is topically related but different — potential contradiction
        return {
          hasContradiction: true,
          conflictingMemoryId: mem.id,
          explanation:
            `Potential contradiction with memory ${mem.id} ` +
            `(similarity ${score.toFixed(3)}, shared tags: ${sharedTags.join(', ')}). ` +
            `Manual review recommended.`,
        };
      }
    }
  }

  return { hasContradiction: false };
}

// ============================================================
// Auto-Approval Logic
// ============================================================

/**
 * Determine whether a staging memory qualifies for automatic approval.
 *
 * Rules:
 *  1. Factual data with confidence > 0.9
 *  2. User-confirmed memories (proposedBy === 'user')
 *  3. Non-contradictory expansions (no contradictions, no duplicates)
 */
export function checkAutoApproval(staging: StagingMemory): {
  eligible: boolean;
  reason?: string;
} {
  // Must not have contradictions or duplicates
  if (staging.contradictionCheckResult?.hasContradiction) {
    return { eligible: false };
  }
  if (staging.duplicateCheckResult?.hasDuplicate) {
    return { eligible: false };
  }

  // Rule 1: High-confidence factual data
  if (
    staging.metadata.source !== 'episodic_promotion' &&
    staging.metadata.confidence > 0.9
  ) {
    return {
      eligible: true,
      reason: `High confidence factual data (${staging.metadata.confidence})`,
    };
  }

  // Rule 2: User-confirmed memories
  if (staging.proposedBy === 'user') {
    return {
      eligible: true,
      reason: 'User-confirmed memory',
    };
  }

  // Rule 3: Non-contradictory expansion from episodic promotion
  if (
    staging.metadata.source === 'episodic_promotion' &&
    !staging.contradictionCheckResult?.hasContradiction &&
    staging.metadata.confidence >= 0.8
  ) {
    return {
      eligible: true,
      reason: 'Non-contradictory episodic promotion with sufficient confidence',
    };
  }

  return { eligible: false };
}

// ============================================================
// Main Staging Pipeline
// ============================================================

/**
 * Process a memory that has been placed in staging.
 *
 * Steps:
 *  1. Duplicate check
 *  2. Contradiction check
 *  3. Persist check results on the staging doc
 *  4. Evaluate auto-approval
 *  5. If auto-approved, promote immediately; otherwise leave for human review
 *
 * Idempotent: if the staging doc already has check results, they are overwritten
 * with fresh values.
 */
export async function processStaging(
  agentId: string,
  stagingMemory: StagingMemory,
): Promise<{
  autoApproved: boolean;
  duplicateResult: DuplicateCheckResult;
  contradictionResult: ContradictionCheckResult;
}> {
  logger.info('Processing staging memory', {
    agentId,
    stagingId: stagingMemory.id,
  });

  // Step 1 & 2 — run checks in parallel
  const [duplicateResult, contradictionResult] = await Promise.all([
    checkDuplicates(agentId, stagingMemory),
    checkContradictions(agentId, stagingMemory),
  ]);

  // Step 3 — persist results on the staging document
  const stagingRef = db()
    .collection(paths.stagingMemory(agentId))
    .doc(stagingMemory.id);

  const updatedStaging: Partial<StagingMemory> = {
    duplicateCheckResult: duplicateResult,
    contradictionCheckResult: contradictionResult,
  };

  // Build a fully-annotated staging record for auto-approval check
  const annotated: StagingMemory = {
    ...stagingMemory,
    duplicateCheckResult: duplicateResult,
    contradictionCheckResult: contradictionResult,
  };

  // Step 4 — auto-approval evaluation
  const { eligible, reason } = checkAutoApproval(annotated);
  updatedStaging.autoApprovalEligible = eligible;
  updatedStaging.autoApprovalReason = reason;

  await stagingRef.update(updatedStaging);

  // Step 5 — promote if eligible
  if (eligible) {
    await approveMemory(agentId, stagingMemory.id);
    logger.info('Staging memory auto-approved', {
      agentId,
      stagingId: stagingMemory.id,
      reason,
    });
    return { autoApproved: true, duplicateResult, contradictionResult };
  }

  // If duplicate, auto-reject
  if (duplicateResult.hasDuplicate) {
    await rejectMemory(
      agentId,
      stagingMemory.id,
      `Duplicate of memory ${duplicateResult.similarMemoryId} ` +
        `(similarity ${duplicateResult.similarityScore?.toFixed(3)})`,
    );
    logger.info('Staging memory auto-rejected as duplicate', {
      agentId,
      stagingId: stagingMemory.id,
    });
  }

  return { autoApproved: false, duplicateResult, contradictionResult };
}

// ============================================================
// Approve / Reject Operations (transactional)
// ============================================================

/**
 * Atomically move a memory from staging to the approved semantic collection.
 * Generates a notification for the agent owner.
 */
export async function approveMemory(
  agentId: string,
  stagingId: string,
): Promise<void> {
  const stagingRef = db()
    .collection(paths.stagingMemory(agentId))
    .doc(stagingId);

  await db().runTransaction(async (tx) => {
    const stagingSnap = await tx.get(stagingRef);
    if (!stagingSnap.exists) {
      throw new Error(
        `Staging memory ${stagingId} not found for agent ${agentId}`,
      );
    }

    const staging = stagingSnap.data() as StagingMemory;

    // Build the approved SemanticMemory (strip staging-only fields)
    const semantic: SemanticMemory = {
      id: staging.id,
      agentId: staging.agentId,
      content: staging.content,
      embedding: staging.embedding,
      metadata: {
        ...staging.metadata,
        validationStatus: 'approved',
        lastAccessed: Timestamp.now(),
      },
      accessControl: staging.accessControl,
    };

    const semanticRef = db()
      .collection(paths.semanticMemory(agentId))
      .doc(staging.id);

    tx.set(semanticRef, semantic);
    tx.delete(stagingRef);

    // Create a notification for the owner
    const notification: Notification = {
      id: '', // will be set by Firestore
      userId: staging.accessControl.ownerId,
      type: 'memory_validation',
      title: 'Memory Approved',
      body: `A new memory has been approved: "${staging.content.substring(0, 80)}..."`,
      data: { agentId, memoryId: staging.id },
      read: false,
      createdAt: Timestamp.now(),
    };

    const notifRef = db()
      .collection(paths.notifications(staging.accessControl.ownerId))
      .doc();
    notification.id = notifRef.id;

    tx.set(notifRef, notification);
  });

  logger.info('Memory approved and moved to semantic', {
    agentId,
    stagingId,
  });
}

/**
 * Atomically move a memory from staging to the rejected collection with a reason.
 */
export async function rejectMemory(
  agentId: string,
  stagingId: string,
  reason: string,
): Promise<void> {
  const stagingRef = db()
    .collection(paths.stagingMemory(agentId))
    .doc(stagingId);

  await db().runTransaction(async (tx) => {
    const stagingSnap = await tx.get(stagingRef);
    if (!stagingSnap.exists) {
      throw new Error(
        `Staging memory ${stagingId} not found for agent ${agentId}`,
      );
    }

    const staging = stagingSnap.data() as StagingMemory;

    const rejected = {
      ...staging,
      metadata: {
        ...staging.metadata,
        validationStatus: 'rejected' as const,
      },
      rejectionReason: reason,
      rejectedAt: Timestamp.now(),
    };

    const rejectedRef = db()
      .collection(paths.rejectedMemory(agentId))
      .doc(staging.id);

    tx.set(rejectedRef, rejected);
    tx.delete(stagingRef);

    // Notify owner
    const notification: Notification = {
      id: '',
      userId: staging.accessControl.ownerId,
      type: 'memory_validation',
      title: 'Memory Rejected',
      body: `Memory rejected: "${staging.content.substring(0, 60)}..." — ${reason}`,
      data: { agentId, memoryId: staging.id, reason },
      read: false,
      createdAt: Timestamp.now(),
    };

    const notifRef = db()
      .collection(paths.notifications(staging.accessControl.ownerId))
      .doc();
    notification.id = notifRef.id;

    tx.set(notifRef, notification);
  });

  logger.info('Memory rejected', { agentId, stagingId, reason });
}
