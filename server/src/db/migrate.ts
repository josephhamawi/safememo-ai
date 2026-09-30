/**
 * Minimal forward-only migration runner.
 *
 * Reads every .sql file in ./migrations in lexical order and applies the ones
 * not yet recorded in schema_migrations. Each file runs inside its own
 * transaction, so a failure leaves the database on the last good version
 * rather than half-migrated.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { closePool, pool } from './index';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  return new Set(rows.map((r) => r.version));
}

async function main(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedVersions();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [version],
      );
      await client.query('COMMIT');
      console.log(`[migrate] applied ${version}`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[migrate] FAILED on ${version}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(
    count === 0 ? '[migrate] already up to date' : `[migrate] applied ${count} migration(s)`,
  );
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await closePool().catch(() => {});
    process.exit(1);
  });
