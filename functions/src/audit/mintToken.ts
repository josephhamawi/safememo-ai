/**
 * Authenticated callable: mint a signed audit share token.
 * Caller must own the memory they are minting a token for.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { mintShareToken } from './share';

const auditShareSecret = defineSecret('AUDIT_SHARE_SECRET');

export const mintAuditShareToken = onCall(
  {
    secrets: [auditShareSecret],
    region: 'us-central1',
    timeoutSeconds: 15,
    memory: '256MiB',
    maxInstances: 20,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required');
    }
    const userId = request.auth.uid;

    const data = (request.data ?? {}) as {
      agentId?: string;
      memoryId?: string;
      ttlDays?: number;
    };

    if (!data.agentId || !data.memoryId) {
      throw new HttpsError('invalid-argument', 'agentId and memoryId required');
    }

    // Verify caller owns the agent that owns the memory
    const agentSnap = await getFirestore()
      .collection('agents')
      .doc(data.agentId)
      .get();
    if (!agentSnap.exists || agentSnap.get('ownerId') !== userId) {
      throw new HttpsError('permission-denied', 'Agent not found or not owned');
    }

    // Verify the memory exists under that agent
    const memSnap = await getFirestore()
      .doc(`agents/${data.agentId}/semanticMemory/${data.memoryId}`)
      .get();
    if (!memSnap.exists) {
      throw new HttpsError('not-found', 'Memory not found');
    }

    const { token, expiresAt } = await mintShareToken({
      tenantId: userId,
      memoryId: data.memoryId,
      ttlDays: data.ttlDays,
    });

    return { token, expiresAt };
  },
);
