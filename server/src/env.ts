/**
 * Validated process configuration.
 *
 * Every secret is required with no default. A self-hosted deployment that
 * boots with a placeholder key is worse than one that refuses to start, so
 * anything missing is a hard failure at import time.
 */

import { z } from 'zod';

import { parseMasterKey } from './crypto/envelope';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  MASTER_ENCRYPTION_KEY: z
    .string()
    .min(1, 'MASTER_ENCRYPTION_KEY is required (openssl rand -base64 32)'),
  MASTER_ENCRYPTION_KEY_ID: z.string().default('k1'),
  /** Retired master key, present only while a rotation is in flight. */
  MASTER_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),
  MASTER_ENCRYPTION_KEY_PREVIOUS_ID: z.string().optional(),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),

  AUDIT_SHARE_SECRET: z
    .string()
    .min(32, 'AUDIT_SHARE_SECRET must be at least 32 characters'),

  /** Browser origin allowed to call this API. Exact match, no wildcards. */
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),

  /** Per-user daily request ceiling. BYOK means the user pays the provider, so
   *  this guards this server's resources rather than a bill. */
  DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(2000),

  /** Embedding backend for semantic memory search.
   *  local  — in-process ONNX, no key, content never leaves the machine
   *  google — the user's own Gemini key (BYOK)
   *  none   — disabled; search degrades to lexical matching */
  EMBEDDING_PROVIDER: z.enum(['local', 'google', 'none']).default('local'),

  /** Open signup vs invite-only. Self-hosters usually want 'open' for the
   *  first account and then switch to 'invite'. */
  SIGNUP_MODE: z.enum(['open', 'invite', 'closed']).default('open'),
});

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Thrown, not logged-and-continued: a misconfigured server must not serve.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const raw = parsed.data;

  const masterKey = parseMasterKey(
    raw.MASTER_ENCRYPTION_KEY_ID,
    raw.MASTER_ENCRYPTION_KEY,
  );

  const previousMasterKey =
    raw.MASTER_ENCRYPTION_KEY_PREVIOUS && raw.MASTER_ENCRYPTION_KEY_PREVIOUS_ID
      ? parseMasterKey(
          raw.MASTER_ENCRYPTION_KEY_PREVIOUS_ID,
          raw.MASTER_ENCRYPTION_KEY_PREVIOUS,
        )
      : undefined;

  if (previousMasterKey && previousMasterKey.id === masterKey.id) {
    throw new Error(
      'MASTER_ENCRYPTION_KEY_PREVIOUS_ID must differ from MASTER_ENCRYPTION_KEY_ID',
    );
  }

  return { ...raw, masterKey, previousMasterKey };
}

export const env = load();

export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
