/**
 * Master-key rotation.
 *
 * Usage:
 *   1. Generate a new key:  openssl rand -base64 32
 *   2. Move the current values to MASTER_ENCRYPTION_KEY_PREVIOUS / _PREVIOUS_ID
 *   3. Put the new key in MASTER_ENCRYPTION_KEY and bump MASTER_ENCRYPTION_KEY_ID
 *   4. Restart the API (it can now read both generations)
 *   5. npm run rotate-master-key
 *   6. Once this reports zero rows remaining, drop the _PREVIOUS_ variables
 *
 * Only the wrapped DEK is rewritten; the API-key ciphertext is never touched.
 * The job is resumable — interrupt it and re-run, and it picks up the rows
 * that are still on the old generation.
 */

import { closePool, pool, transaction } from '../db';
import { env } from '../env';
import { rewrapCredential, type SealedCredential } from './envelope';

const BATCH_SIZE = 100;

interface Row {
  id: string;
  user_id: string;
  provider: string;
  key_ciphertext: Buffer;
  key_iv: Buffer;
  key_tag: Buffer;
  wrapped_dek: Buffer;
  dek_iv: Buffer;
  dek_tag: Buffer;
  master_key_id: string;
}

async function main(): Promise<void> {
  const previous = env.previousMasterKey;

  if (!previous) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY_PREVIOUS and MASTER_ENCRYPTION_KEY_PREVIOUS_ID must be set to rotate',
    );
  }

  console.log(`[rotate] ${previous.id} -> ${env.masterKey.id}`);

  let rotated = 0;
  let failed = 0;

  for (;;) {
    const { rows } = await pool.query<Row>(
      `SELECT id, user_id, provider,
              key_ciphertext, key_iv, key_tag,
              wrapped_dek, dek_iv, dek_tag, master_key_id
         FROM provider_credentials
        WHERE master_key_id = $1
        ORDER BY created_at
        LIMIT $2`,
      [previous.id, BATCH_SIZE],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const sealed: SealedCredential = {
        keyCiphertext: row.key_ciphertext,
        keyIv: row.key_iv,
        keyTag: row.key_tag,
        wrappedDek: row.wrapped_dek,
        dekIv: row.dek_iv,
        dekTag: row.dek_tag,
        masterKeyId: row.master_key_id,
      };

      try {
        const next = rewrapCredential(
          previous,
          env.masterKey,
          { credentialId: row.id, userId: row.user_id, provider: row.provider },
          sealed,
        );

        await transaction(async (client) => {
          // Guard on master_key_id so a concurrent rotation or a re-save that
          // already moved this row does not get clobbered.
          const result = await client.query(
            `UPDATE provider_credentials
                SET wrapped_dek = $1, dek_iv = $2, dek_tag = $3,
                    master_key_id = $4, updated_at = now()
              WHERE id = $5 AND master_key_id = $6`,
            [
              next.wrappedDek,
              next.dekIv,
              next.dekTag,
              next.masterKeyId,
              row.id,
              previous.id,
            ],
          );
          if (result.rowCount === 0) {
            console.warn(`[rotate] skipped ${row.id} (changed concurrently)`);
          }
        });

        rotated += 1;
      } catch (err) {
        // Keep going: one unreadable row must not block the rest of the table.
        failed += 1;
        console.error(
          `[rotate] FAILED credential ${row.id} (user ${row.user_id}, ${row.provider}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (failed > 0 && rotated === 0) {
      throw new Error('every credential in the first batch failed — aborting');
    }
  }

  const { rows: remaining } = await pool.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM provider_credentials WHERE master_key_id <> $1',
    [env.masterKey.id],
  );

  console.log(`[rotate] rewrapped ${rotated}, failed ${failed}`);
  console.log(`[rotate] rows not on ${env.masterKey.id}: ${remaining[0]?.count ?? '?'}`);

  if (failed > 0) {
    console.error(
      '[rotate] keep the previous key configured until the failures are resolved',
    );
    process.exitCode = 1;
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool().catch(() => {});
    process.exit(1);
  });
