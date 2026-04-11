import './../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const db = admin.firestore();

/**
 * Recursively delete all subcollections of an agent document, then the
 * agent itself. Verifies the caller owns the agent before deleting.
 */
export const deleteAgent = onCall(
  { region: 'us-central1', memory: '512MiB', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required');
    }

    const userId = request.auth.uid;
    const agentId = (request.data?.agentId as string | undefined)?.trim();

    if (!agentId) {
      throw new HttpsError('invalid-argument', 'agentId is required');
    }

    // Verify ownership
    const agentRef = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();

    if (!agentSnap.exists) {
      throw new HttpsError('not-found', 'Agent not found');
    }

    const agentData = agentSnap.data();
    if (agentData?.ownerId !== userId) {
      throw new HttpsError('permission-denied', 'You do not own this agent');
    }

    logger.info(`Cascade-deleting agent ${agentId} for user ${userId}`);

    // Recursively delete all subcollections
    const subcollections = [
      'conversations',
      'workingMemory',
      'semanticMemory',
      'episodicMemory',
      'stagingMemory',
      'rejectedMemory',
    ];

    let totalDeleted = 0;
    for (const subName of subcollections) {
      const deleted = await recursiveDelete(agentRef.collection(subName));
      totalDeleted += deleted;
      logger.info(`Deleted ${deleted} docs from ${subName}`);
    }

    // Finally, delete the agent itself
    await agentRef.delete();
    totalDeleted++;

    logger.info(`Agent ${agentId} fully deleted (${totalDeleted} docs total)`);

    return { success: true, agentId, deletedCount: totalDeleted };
  },
);

/**
 * Recursively delete all documents in a collection (and any nested
 * subcollections under each document).
 */
async function recursiveDelete(
  collectionRef: admin.firestore.CollectionReference,
  batchSize = 100,
): Promise<number> {
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snap = await collectionRef.limit(batchSize).get();
    if (snap.empty) {
      hasMore = false;
      break;
    }

    // Delete any subcollections of these documents first
    for (const doc of snap.docs) {
      const subs = await doc.ref.listCollections();
      for (const sub of subs) {
        totalDeleted += await recursiveDelete(sub, batchSize);
      }
    }

    // Then batch-delete the docs themselves
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snap.size;

    hasMore = snap.size === batchSize;
  }

  return totalDeleted;
}
