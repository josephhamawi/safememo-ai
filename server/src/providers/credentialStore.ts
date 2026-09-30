/**
 * Storage and retrieval of bring-your-own-key provider credentials.
 *
 * Invariants this module exists to hold:
 *
 *   - A plaintext API key is only ever in memory, only for the duration of one
 *     operation, and is never returned to any HTTP response.
 *   - Nothing here logs a key, a ciphertext, or a decrypted buffer.
 *   - Every mutation is recorded in the audit chain in the same transaction.
 */

import { randomUUID } from 'node:crypto';

import { query, queryOne, transaction } from '../db';
import { env } from '../env';
import { ACCOUNT_CHAIN, appendAudit } from '../lib/audit';
import {
  DecryptionError,
  type CredentialContext,
  type SealedCredential,
  keyLast4,
  openCredential,
  sealCredential,
} from '../crypto/envelope';
import { PROVIDERS, type ProviderId, verifyKey } from './registry';

/** "an Anthropic key", "a Google key" — provider labels vary. */
function article(label: string): string {
  return /^[AEIOU]/i.test(label) ? 'an' : 'a';
}

/** Everything the UI is allowed to know about a stored credential. */
export interface CredentialSummary {
  id: string;
  provider: ProviderId;
  label: string | null;
  keyLast4: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CredentialRow {
  id: string;
  user_id: string;
  provider: ProviderId;
  label: string | null;
  key_last4: string;
  key_ciphertext: Buffer;
  key_iv: Buffer;
  key_tag: Buffer;
  wrapped_dek: Buffer;
  dek_iv: Buffer;
  dek_tag: Buffer;
  master_key_id: string;
  verified_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

function toSummary(row: CredentialRow): CredentialSummary {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    keyLast4: row.key_last4,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function toSealed(row: CredentialRow): SealedCredential {
  return {
    keyCiphertext: row.key_ciphertext,
    keyIv: row.key_iv,
    keyTag: row.key_tag,
    wrappedDek: row.wrapped_dek,
    dekIv: row.dek_iv,
    dekTag: row.dek_tag,
    masterKeyId: row.master_key_id,
  };
}

const SUMMARY_COLUMNS = `
  id, user_id, provider, label, key_last4,
  key_ciphertext, key_iv, key_tag,
  wrapped_dek, dek_iv, dek_tag, master_key_id,
  verified_at, last_used_at, created_at
`;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listCredentials(
  userId: string,
): Promise<CredentialSummary[]> {
  const rows = await query<CredentialRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM provider_credentials
      WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  );
  return rows.map(toSummary);
}

export async function hasAnyCredential(userId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM provider_credentials
        WHERE user_id = $1 AND verified_at IS NOT NULL
     ) AS exists`,
    [userId],
  );
  return row?.exists ?? false;
}

export class CredentialNotFoundError extends Error {
  constructor(provider: ProviderId) {
    super(`No stored credential for provider "${provider}"`);
    this.name = 'CredentialNotFoundError';
  }
}

/**
 * Decrypt a stored key for immediate use.
 *
 * The returned buffer is the caller's to zero. Use it like this:
 *
 *   const key = await useCredential(userId, 'anthropic');
 *   try { ... } finally { key.fill(0); }
 *
 * If a master-key rotation is in flight, rows still sealed under the retired
 * key are transparently opened with MASTER_ENCRYPTION_KEY_PREVIOUS so requests
 * keep succeeding while `npm run rotate-master-key` works through the table.
 */
export async function useCredential(
  userId: string,
  provider: ProviderId,
): Promise<Buffer> {
  const row = await queryOne<CredentialRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM provider_credentials
      WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );

  if (!row) throw new CredentialNotFoundError(provider);

  const ctx: CredentialContext = {
    credentialId: row.id,
    userId: row.user_id,
    provider: row.provider,
  };
  const sealed = toSealed(row);

  let plaintext: Buffer;
  try {
    plaintext = openCredential(env.masterKey, ctx, sealed);
  } catch (err) {
    const previous = env.previousMasterKey;
    if (!previous || sealed.masterKeyId !== previous.id) throw err;
    plaintext = openCredential(previous, ctx, sealed);
  }

  // Best-effort usage stamp. A failure here must not fail the request the key
  // was fetched for, so it is fire-and-forget.
  void query(
    'UPDATE provider_credentials SET last_used_at = now() WHERE id = $1',
    [row.id],
  ).catch(() => {
    /* non-critical */
  });

  return plaintext;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export type SaveResult =
  | { ok: true; credential: CredentialSummary; replaced: boolean }
  | { ok: false; reason: 'malformed'; message: string }
  | { ok: false; reason: 'rejected'; message: string };

/**
 * Verify a key against the live provider, then store it sealed.
 *
 * Verification happens before any write, so an unusable key never lands in the
 * database and the user finds out at the moment they paste it rather than on
 * their first message.
 */
export async function saveCredential(params: {
  userId: string;
  provider: ProviderId;
  apiKey: string;
  label?: string | undefined;
}): Promise<SaveResult> {
  const { userId, provider, label } = params;
  const apiKey = params.apiKey.trim();
  const definition = PROVIDERS[provider];

  if (!definition.looksWellFormed(apiKey)) {
    return {
      ok: false,
      reason: 'malformed',
      message: `That does not look like ${article(definition.label)} ${definition.label} key. ${definition.formatHint}.`,
    };
  }

  const verification = await verifyKey(provider, apiKey);
  if (!verification.ok) {
    const { verificationMessage } = await import('./registry');
    return {
      ok: false,
      reason: 'rejected',
      message: verificationMessage(provider, verification.reason),
    };
  }

  // Generated here, not by the database, because it is mixed into the AAD and
  // must be known before the ciphertext exists.
  const credentialId = randomUUID();
  const sealed = sealCredential(
    env.masterKey,
    { credentialId, userId, provider },
    apiKey,
  );
  const last4 = keyLast4(apiKey);

  return transaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM provider_credentials WHERE user_id = $1 AND provider = $2',
      [userId, provider],
    );
    const replaced = existing.rowCount! > 0;

    // On replace, the new row keeps the new id so the AAD stays consistent
    // with what was just sealed.
    if (replaced) {
      await client.query(
        'DELETE FROM provider_credentials WHERE user_id = $1 AND provider = $2',
        [userId, provider],
      );
    }

    const { rows } = await client.query<CredentialRow>(
      `INSERT INTO provider_credentials
         (id, user_id, provider, label, key_last4,
          key_ciphertext, key_iv, key_tag,
          wrapped_dek, dek_iv, dek_tag, master_key_id, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       RETURNING ${SUMMARY_COLUMNS}`,
      [
        credentialId,
        userId,
        provider,
        label ?? null,
        last4,
        sealed.keyCiphertext,
        sealed.keyIv,
        sealed.keyTag,
        sealed.wrappedDek,
        sealed.dekIv,
        sealed.dekTag,
        sealed.masterKeyId,
      ],
    );

    await appendAudit(client, {
      userId,
      chainKey: ACCOUNT_CHAIN,
      action: replaced ? 'credential.replaced' : 'credential.added',
      actorId: userId,
      // Metadata only. The key, its ciphertext, and its length stay out of the
      // audit payload — an audit trail is not a place to leak a secret.
      payload: { provider, keyLast4: last4, credentialId },
    });

    return { ok: true as const, credential: toSummary(rows[0]!), replaced };
  });
}

export async function deleteCredential(
  userId: string,
  provider: ProviderId,
): Promise<boolean> {
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string; key_last4: string }>(
      `DELETE FROM provider_credentials
        WHERE user_id = $1 AND provider = $2
        RETURNING id, key_last4`,
      [userId, provider],
    );

    const row = rows[0];
    if (!row) return false;

    await appendAudit(client, {
      userId,
      chainKey: ACCOUNT_CHAIN,
      action: 'credential.deleted',
      actorId: userId,
      payload: { provider, keyLast4: row.key_last4, credentialId: row.id },
    });

    return true;
  });
}

export { DecryptionError };
