/**
 * Audit share endpoint.
 *
 * Public, unauthenticated, but only readable via HMAC-signed tokens minted
 * from the dashboard. A token binds a single (tenantId, memoryId) pair to an
 * expiry timestamp and is signed with AUDIT_SHARE_SECRET so it cannot be
 * forged. Tokens default to 7-day expiry; tenants generate them on demand
 * from the "Share audit trail" button on a memory.
 *
 * Why not require auth? Auditors and external counsel typically need to see
 * a single memory's lineage without provisioning accounts. The signed-token
 * approach gives the same access control as a magic link without exposing
 * cross-tenant data.
 */

import * as crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

const auditShareSecret = defineSecret('AUDIT_SHARE_SECRET');

/** Default token expiry. Tokens are minted by the dashboard, this is a ceiling. */
export const DEFAULT_TOKEN_TTL_DAYS = 7;
const MAX_TOKEN_TTL_DAYS = 30;

const AUDIT_COLLECTION = 'auditLogs';

// ---------------------------------------------------------------------------
// Token shape
// ---------------------------------------------------------------------------

interface SharePayload {
  tenantId: string;
  memoryId: string;
  expiresAt: number; // unix epoch ms
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(input.length / 4) * 4,
    '=',
  );
  return Buffer.from(padded, 'base64');
}

/**
 * Mint a signed share token. Server-side helper used by other Cloud Functions
 * (e.g. an authenticated mintShareToken endpoint can wrap this).
 */
export function signToken(
  payload: SharePayload,
  secret = auditShareSecret.value(),
): string {
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(
    crypto.createHmac('sha256', secret).update(body).digest(),
  );
  return `${body}.${sig}`;
}

/**
 * Verify a token; returns the payload if valid, throws otherwise.
 */
export function verifyToken(
  token: string,
  secret = auditShareSecret.value(),
): SharePayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed token');
  }
  const [body, sig] = parts;

  const expected = base64url(
    crypto.createHmac('sha256', secret).update(body).digest(),
  );
  // Constant-time comparison
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    throw new Error('Invalid signature');
  }

  const payload = JSON.parse(fromBase64url(body).toString('utf8')) as SharePayload;
  if (
    !payload.tenantId ||
    !payload.memoryId ||
    typeof payload.expiresAt !== 'number'
  ) {
    throw new Error('Invalid payload shape');
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error('Token expired');
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------

/**
 * GET /auditShare?token=<jwt-like>
 *
 * Returns the audit chain for the (tenantId, memoryId) pair encoded in the
 * token. Read-only, no PII beyond the memoryId is exposed (params/result are
 * already hashed, not stored verbatim, in audit entries).
 */
export const auditShare = onRequest(
  {
    secrets: [auditShareSecret],
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 50,
    cors: true,
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const token = (req.query.token as string | undefined) ?? '';
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }

    let payload: SharePayload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      logger.warn('Audit share token verification failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }

    // Bound token TTL (defense-in-depth: even a leaked secret can't mint
    // long-lived tokens without bypassing this server-side check).
    const ttlDays = (payload.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
    if (ttlDays > MAX_TOKEN_TTL_DAYS) {
      res.status(403).json({ error: 'Token TTL exceeds policy' });
      return;
    }

    try {
      const snap = await getFirestore()
        .collection(AUDIT_COLLECTION)
        .where('userId', '==', payload.tenantId)
        .where('memoryId', '==', payload.memoryId)
        .orderBy('timestamp', 'asc')
        .limit(500)
        .get();

      const entries = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          action: data.action,
          status: data.status,
          timestamp: data.timestamp?.toMillis?.() ?? null,
          previousChainHash: data.previousChainHash ?? null,
          chainHash: data.chainHash,
          resultHash: data.resultHash,
          // Intentionally omit raw params — only hashes are auditable externally.
        };
      });

      // Verify chain integrity inline: each entry's chainHash must equal
      // SHA256(previousChainHash || resultHash).
      let chainOk = true;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const prev = i === 0 ? null : entries[i - 1].chainHash;
        const expected = crypto
          .createHash('sha256')
          .update((prev ?? '') + ':' + (e.resultHash ?? ''))
          .digest('hex');
        if (e.chainHash !== expected) {
          chainOk = false;
          break;
        }
      }

      res.status(200).json({
        memoryId: payload.memoryId,
        tenantId: payload.tenantId,
        chainOk,
        entryCount: entries.length,
        entries,
      });
    } catch (err) {
      logger.error('Audit share lookup failed', {
        err: err instanceof Error ? err.message : String(err),
        memoryId: payload.memoryId,
      });
      res.status(500).json({ error: 'Failed to read audit log' });
    }
  },
);

/**
 * Authenticated helper: mint a share token for a memory the caller owns.
 * Exposed as a callable for the dashboard "Share" button.
 */
export async function mintShareToken(input: {
  tenantId: string;
  memoryId: string;
  ttlDays?: number;
}): Promise<{ token: string; expiresAt: number }> {
  const ttlDays = Math.min(
    Math.max(input.ttlDays ?? DEFAULT_TOKEN_TTL_DAYS, 1),
    MAX_TOKEN_TTL_DAYS,
  );
  const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const token = signToken({
    tenantId: input.tenantId,
    memoryId: input.memoryId,
    expiresAt,
  });
  return { token, expiresAt };
}
