/**
 * Firestore Triggers
 *
 * Reactive functions that fire on document changes.
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { StagingMemory, Notification } from './types';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

/**
 * When a new staging memory is created, run the validation gate.
 */
export const onStagingMemoryCreated = onDocumentCreated(
  {
    document: 'agents/{agentId}/stagingMemory/{stagingId}',
    region: 'us-central1',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const agentId = event.params.agentId;
    const stagingId = event.params.stagingId;
    const staging = snapshot.data() as StagingMemory;

    logger.info(`New staging memory created for agent ${agentId}: ${stagingId}`);

    try {
      // Import validation gate dynamically to avoid circular deps
      const { processStaging } = await import('./memory/validationGate');
      await processStaging(agentId, staging);
    } catch (error) {
      logger.error('Validation gate error:', error);
    }
  }
);

/**
 * When a semantic memory is approved, notify the user.
 */
export const onMemoryApproved = onDocumentUpdated(
  {
    document: 'agents/{agentId}/semanticMemory/{memoryId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // Only trigger on status change to 'approved'
    if (
      before.metadata?.validationStatus !== 'approved' &&
      after.metadata?.validationStatus === 'approved'
    ) {
      const agentId = event.params.agentId;
      const ownerId = after.accessControl?.ownerId;

      if (!ownerId) return;

      // Get agent name for notification
      const agentDoc = await db.doc(`agents/${agentId}`).get();
      const agentName = agentDoc.data()?.name || 'Agent';

      const notification: Omit<Notification, 'id'> = {
        userId: ownerId,
        type: 'memory_validation',
        title: 'Memory Approved',
        body: `A new memory was approved for ${agentName}: "${after.content?.substring(0, 100)}..."`,
        data: {
          agentId,
          memoryId: event.params.memoryId,
        },
        read: false,
        createdAt: Timestamp.now(),
      };

      await db
        .collection(`notifications`)
        .doc(ownerId)
        .collection('items')
        .add(notification);

      logger.info(`Notification sent to ${ownerId} for approved memory`);
    }
  }
);
