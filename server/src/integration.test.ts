/**
 * Integration tests against a real Postgres.
 *
 * Skipped unless TEST_DATABASE_URL points at a disposable database with the
 * pgvector extension available:
 *
 *   docker compose up -d db
 *   TEST_DATABASE_URL=postgres://safememo:<pw>@localhost:5432/safememo_test \
 *     npm test
 *
 * These cover the things unit tests cannot: that the migration actually
 * applies, that tenant isolation holds at the query layer, and that the audit
 * chain verifies end to end.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// vitest's describe.skipIf keeps this file green in CI without a database
// while still failing loudly when one is present and something is broken.
const suite = describe.skipIf(!TEST_DATABASE_URL);

suite('postgres integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    // Fresh schema every run so tests never depend on leftover state.
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const sql = readFileSync(
      join(__dirname, 'db/migrations/001_init.sql'),
      'utf8',
    );
    await pool.query(sql);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  async function makeUser(email = `${randomUUID()}@example.test`) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    return rows[0]!.id;
  }

  describe('schema', () => {
    it('applies cleanly and creates the expected tables', async () => {
      const { rows } = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name`,
      );
      const names = rows.map((r) => r.table_name);

      for (const expected of [
        'users',
        'sessions',
        'provider_credentials',
        'agents',
        'semantic_memories',
        'staging_memories',
        'audit_logs',
        'audit_chain_heads',
        'usage_daily',
      ]) {
        expect(names).toContain(expected);
      }
    });

    it('enables pgvector and accepts a 768-dim embedding', async () => {
      const userId = await makeUser();
      const { rows: agentRows } = await pool.query<{ id: string }>(
        `INSERT INTO agents (user_id, name, model) VALUES ($1, 'a', 'claude-opus-5')
         RETURNING id`,
        [userId],
      );
      const vec = `[${Array.from({ length: 768 }, () => 0.1).join(',')}]`;

      await expect(
        pool.query(
          `INSERT INTO semantic_memories (user_id, agent_id, content, embedding)
           VALUES ($1, $2, 'hello', $3)`,
          [userId, agentRows[0]!.id, vec],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects an embedding of the wrong dimension', async () => {
      const userId = await makeUser();
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO agents (user_id, name, model) VALUES ($1, 'a', 'm') RETURNING id`,
        [userId],
      );
      const wrong = `[${Array.from({ length: 512 }, () => 0.1).join(',')}]`;

      await expect(
        pool.query(
          `INSERT INTO semantic_memories (user_id, agent_id, content, embedding)
           VALUES ($1, $2, 'x', $3)`,
          [userId, rows[0]!.id, wrong],
        ),
      ).rejects.toThrow();
    });
  });

  describe('constraints that enforce the product rules', () => {
    it('allows only one credential per provider per user', async () => {
      const userId = await makeUser();
      const insert = () =>
        pool.query(
          `INSERT INTO provider_credentials
             (user_id, provider, key_last4, key_ciphertext, key_iv, key_tag,
              wrapped_dek, dek_iv, dek_tag, master_key_id)
           VALUES ($1,'anthropic','abcd',$2,$3,$4,$5,$6,$7,'k1')`,
          [
            userId,
            randomBytes(32),
            randomBytes(12),
            randomBytes(16),
            randomBytes(48),
            randomBytes(12),
            randomBytes(16),
          ],
        );

      await insert();
      await expect(insert()).rejects.toThrow(/unique|duplicate/i);
    });

    it('rejects an unknown provider', async () => {
      const userId = await makeUser();
      await expect(
        pool.query(
          `INSERT INTO provider_credentials
             (user_id, provider, key_last4, key_ciphertext, key_iv, key_tag,
              wrapped_dek, dek_iv, dek_tag, master_key_id)
           VALUES ($1,'definitely-not-a-provider','abcd',$2,$3,$4,$5,$6,$7,'k1')`,
          [
            userId,
            randomBytes(32),
            randomBytes(12),
            randomBytes(16),
            randomBytes(48),
            randomBytes(12),
            randomBytes(16),
          ],
        ),
      ).rejects.toThrow();
    });

    it('cascades credential deletion when a user is removed', async () => {
      const userId = await makeUser();
      await pool.query(
        `INSERT INTO provider_credentials
           (user_id, provider, key_last4, key_ciphertext, key_iv, key_tag,
            wrapped_dek, dek_iv, dek_tag, master_key_id)
         VALUES ($1,'openai','wxyz',$2,$3,$4,$5,$6,$7,'k1')`,
        [
          userId,
          randomBytes(32),
          randomBytes(12),
          randomBytes(16),
          randomBytes(48),
          randomBytes(12),
          randomBytes(16),
        ],
      );

      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      const { rows } = await pool.query(
        'SELECT 1 FROM provider_credentials WHERE user_id = $1',
        [userId],
      );
      expect(rows).toHaveLength(0);
    });

    it('makes audit_logs append-only', async () => {
      const userId = await makeUser();
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO audit_logs (user_id, chain_key, action, entry_hash)
         VALUES ($1, 'account', 'test', $2) RETURNING id`,
        [userId, randomBytes(32)],
      );
      const id = rows[0]!.id;

      await expect(
        pool.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['tampered', id]),
      ).rejects.toThrow(/append-only/);

      await expect(
        pool.query('DELETE FROM audit_logs WHERE id = $1', [id]),
      ).rejects.toThrow(/append-only/);
    });

    it('treats emails case-insensitively', async () => {
      const email = `${randomUUID()}@Example.TEST`;
      await makeUser(email);
      await expect(makeUser(email.toLowerCase())).rejects.toThrow(
        /unique|duplicate/i,
      );
    });
  });

  describe('audit chain', () => {
    it('verifies a multi-entry chain and detects a broken link', async () => {
      const { appendAudit, verifyChain } = await import('./lib/audit');
      const userId = await makeUser();
      const chainKey = randomUUID();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const action of ['memory.staged', 'memory.approved', 'memory.shared']) {
          await appendAudit(client, {
            userId,
            chainKey,
            action,
            actorId: userId,
            payload: { note: action },
          });
        }
        await client.query('COMMIT');

        const clean = await verifyChain(client, chainKey);
        expect(clean.valid).toBe(true);
        expect(clean.entries).toBe(3);

        // Corrupt a stored hash directly, bypassing the trigger, to prove the
        // verifier actually checks rather than trusting the column.
        await client.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update');
        await client.query(
          `UPDATE audit_logs
              SET entry_hash = $1
            WHERE id = (SELECT min(id) FROM audit_logs WHERE chain_key = $2)`,
          [randomBytes(32), chainKey],
        );
        await client.query('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update');

        const broken = await verifyChain(client, chainKey);
        expect(broken.valid).toBe(false);
        expect(broken.brokenAt).toBeDefined();
      } finally {
        client.release();
      }
    });
  });
});
