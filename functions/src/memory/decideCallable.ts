/**
 * Authenticated callable: approve or reject a staged memory.
 *
 * Lives behind a Cloud Function (not a direct Firestore write) so every
 * decision goes through the hash-chained audit log. The Firestore rules
 * forbid direct client writes to `semanticMemory` for this reason.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logMemoryAction } from '../security/auditLogger';
import { approveMemory, rejectMemory } from './validationGate';

export const decideMemory = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 50,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required');
    }
    const userId = request.auth.uid;

    const data = (request.data ?? {}) as {
      agentId?: string;
      stagingId?: string;
      decision?: 'approve' | 'reject';
      reason?: string;
    };

    if (!data.agentId || !data.stagingId || !data.decision) {
      throw new HttpsError(
        'invalid-argument',
        'agentId, stagingId, and decision are required',
      );
    }
    if (data.decision === 'reject' && !data.reason?.trim()) {
      throw new HttpsError(
        'invalid-argument',
        'reason is required when rejecting',
      );
    }

    // Verify caller owns the parent agent
    const agentSnap = await getFirestore()
      .collection('agents')
      .doc(data.agentId)
      .get();
    if (!agentSnap.exists || agentSnap.get('ownerId') !== userId) {
      throw new HttpsError('permission-denied', 'Agent not found or not owned');
    }

    if (data.decision === 'approve') {
      await approveMemory(data.agentId, data.stagingId);
      await logMemoryAction(userId, data.agentId, 'approved', data.stagingId, {
        reviewerId: userId,
      });
      return { ok: true, decision: 'approved' };
    }

    await rejectMemory(data.agentId, data.stagingId, data.reason!.trim());
    await logMemoryAction(userId, data.agentId, 'rejected', data.stagingId, {
      reviewerId: userId,
      reason: data.reason!.trim(),
    });
    return { ok: true, decision: 'rejected' };
  },
);

/**
 * Right-to-erasure: purge an approved memory from semanticMemory.
 * The deletion itself is audit-logged and the original content is
 * archived to rejectedMemory with a redaction marker, so the audit
 * chain remains intact while the embedding is removed.
 */
export const purgeMemory = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 50,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required');
    }
    const userId = request.auth.uid;

    const data = (request.data ?? {}) as {
      agentId?: string;
      memoryId?: string;
      reason?: string;
    };
    if (!data.agentId || !data.memoryId) {
      throw new HttpsError('invalid-argument', 'agentId and memoryId required');
    }

    const db = getFirestore();
    const agentSnap = await db.collection('agents').doc(data.agentId).get();
    if (!agentSnap.exists || agentSnap.get('ownerId') !== userId) {
      throw new HttpsError('permission-denied', 'Agent not found or not owned');
    }

    const memRef = db.doc(
      `agents/${data.agentId}/semanticMemory/${data.memoryId}`,
    );
    const rejRef = db.doc(
      `agents/${data.agentId}/rejectedMemory/${data.memoryId}`,
    );

    await db.runTransaction(async (tx) => {
      const memSnap = await tx.get(memRef);
      if (!memSnap.exists) {
        throw new HttpsError('not-found', 'Memory not found');
      }
      const mem = memSnap.data()!;
      // Archive without the embedding (right-to-erasure: vector removed).
      tx.set(rejRef, {
        ...mem,
        embedding: [],
        metadata: {
          ...(mem.metadata ?? {}),
          validationStatus: 'rejected',
        },
        rejectionReason: data.reason?.trim() || 'Purged by owner (erasure)',
        rejectedAt: Timestamp.now(),
      });
      tx.delete(memRef);
    });

    await logMemoryAction(userId, data.agentId, 'purged', data.memoryId, {
      reviewerId: userId,
      reason: data.reason?.trim() || 'Purged by owner (erasure)',
    });

    return { ok: true };
  },
);
