/**
 * Tamper-evident audit chain.
 *
 * Each entry hashes the previous entry's hash together with a canonical
 * encoding of this entry, so editing or removing any earlier row invalidates
 * every hash after it. The append and the head-pointer update happen in the
 * caller's transaction, so an action and its audit record commit together or
 * not at all.
 */

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

/** Chain used for account-level events that are not tied to one memory. */
export const ACCOUNT_CHAIN = 'account';

export interface AuditEntryInput {
  userId: string;
  /** Chain scope — a memory id, or ACCOUNT_CHAIN. */
  chainKey: string;
  action: string;
  /** Who performed it. Null for system actions. */
  actorId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Deterministic JSON: object keys sorted at every level.
 *
 * Without this, two encoders that order keys differently produce different
 * hashes for the same logical entry and the chain fails to verify on replay.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}

export function computeEntryHash(
  prevHash: Buffer | null,
  entry: {
    userId: string;
    chainKey: string;
    action: string;
    actorId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  },
): Buffer {
  const hash = createHash('sha256');
  hash.update(prevHash ?? Buffer.alloc(32)); // genesis links to 32 zero bytes
  hash.update(
    canonicalize({
      userId: entry.userId,
      chainKey: entry.chainKey,
      action: entry.action,
      actorId: entry.actorId,
      payload: entry.payload,
      createdAt: entry.createdAt,
    }),
    'utf8',
  );
  return hash.digest();
}

/**
 * Append one entry. Must run inside a transaction.
 *
 * The head row is locked FOR UPDATE so two concurrent appends to the same
 * chain serialize rather than both linking to the same parent and forking it.
 */
export async function appendAudit(
  client: PoolClient,
  input: AuditEntryInput,
): Promise<{ id: string; entryHash: Buffer }> {
  const { rows: headRows } = await client.query<{ head_hash: Buffer }>(
    'SELECT head_hash FROM audit_chain_heads WHERE chain_key = $1 FOR UPDATE',
    [input.chainKey],
  );
  const prevHash = headRows[0]?.head_hash ?? null;

  const createdAt = new Date().toISOString();
  const actorId = input.actorId ?? null;
  const payload = input.payload ?? {};

  const entryHash = computeEntryHash(prevHash, {
    userId: input.userId,
    chainKey: input.chainKey,
    action: input.action,
    actorId,
    payload,
    createdAt,
  });

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO audit_logs
       (user_id, chain_key, action, actor_id, payload, prev_hash, entry_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.userId,
      input.chainKey,
      input.action,
      actorId,
      JSON.stringify(payload),
      prevHash,
      entryHash,
      createdAt,
    ],
  );

  const id = rows[0]!.id;

  await client.query(
    `INSERT INTO audit_chain_heads (chain_key, user_id, head_hash, head_id, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (chain_key)
       DO UPDATE SET head_hash = EXCLUDED.head_hash,
                     head_id   = EXCLUDED.head_id,
                     updated_at = now()`,
    [input.chainKey, input.userId, entryHash, id],
  );

  return { id, entryHash };
}

/**
 * Walk a chain from the genesis entry and confirm every link.
 * This is what an auditor runs against a shared trail.
 */
export async function verifyChain(
  client: PoolClient,
  chainKey: string,
): Promise<{ valid: boolean; entries: number; brokenAt?: string }> {
  const { rows } = await client.query<{
    id: string;
    user_id: string;
    action: string;
    actor_id: string | null;
    payload: Record<string, unknown>;
    prev_hash: Buffer | null;
    entry_hash: Buffer;
    created_at: Date;
  }>(
    `SELECT id, user_id, action, actor_id, payload, prev_hash, entry_hash, created_at
       FROM audit_logs WHERE chain_key = $1 ORDER BY id ASC`,
    [chainKey],
  );

  let prevHash: Buffer | null = null;

  for (const row of rows) {
    if ((row.prev_hash === null) !== (prevHash === null)) {
      return { valid: false, entries: rows.length, brokenAt: row.id };
    }
    if (prevHash && row.prev_hash && !prevHash.equals(row.prev_hash)) {
      return { valid: false, entries: rows.length, brokenAt: row.id };
    }

    const expected = computeEntryHash(prevHash, {
      userId: row.user_id,
      chainKey,
      action: row.action,
      actorId: row.actor_id,
      payload: row.payload,
      createdAt: row.created_at.toISOString(),
    });

    if (!expected.equals(row.entry_hash)) {
      return { valid: false, entries: rows.length, brokenAt: row.id };
    }

    prevHash = row.entry_hash;
  }

  return { valid: true, entries: rows.length };
}
