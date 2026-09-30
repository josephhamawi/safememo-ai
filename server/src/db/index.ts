import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import { env, isProduction } from '../env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Self-hosted Postgres on the compose network is not TLS-terminated; a
  // managed provider will be. Opt in via ?sslmode=require in DATABASE_URL.
  ssl: isProduction && env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: true }
    : undefined,
});

pool.on('error', (err) => {
  // An idle client blew up. Log and let the pool replace it; do not exit.
  console.error('[db] idle client error', err.message);
});

export async function query<T extends QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/**
 * Run a function inside a transaction, rolling back on any throw.
 *
 * Used for anything that must be atomic with an audit-chain append — if the
 * chain write fails, the action it describes must not survive.
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* connection already dead; the pool will discard it */
    });
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
