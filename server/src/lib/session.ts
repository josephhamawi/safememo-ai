/**
 * Opaque session tokens.
 *
 * The raw token exists in the user's cookie and nowhere else — the database
 * stores only its SHA-256. A stolen database dump therefore yields no usable
 * sessions, which a signed-JWT-in-a-cookie scheme cannot claim once the
 * signing secret leaks alongside it.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { query, queryOne } from '../db';
import { env, isProduction } from '../env';

const TOKEN_BYTES = 32;
export const SESSION_COOKIE = 'safememo_session';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | undefined; ip?: string | undefined } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(
    Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      hashToken(token),
      userId,
      expiresAt,
      meta.userAgent?.slice(0, 512) ?? null,
      meta.ip ?? null,
    ],
  );

  return { token, expiresAt };
}

export async function resolveSession(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  const row = await queryOne<{
    id: string;
    email: string;
    display_name: string | null;
    is_admin: boolean;
    expires_at: Date;
  }>(
    `SELECT u.id, u.email, u.display_name, u.is_admin, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [hashToken(token)],
  );

  if (!row) return null;

  if (row.expires_at.getTime() <= Date.now()) {
    void destroySession(token).catch(() => {
      /* best effort */
    });
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isAdmin: row.is_admin,
  };
}

export async function destroySession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

/** Remove expired rows. Call from a periodic job. */
export async function pruneSessions(): Promise<number> {
  const rows = await query<{ count: string }>(
    'WITH d AS (DELETE FROM sessions WHERE expires_at <= now() RETURNING 1) SELECT count(*)::text AS count FROM d',
  );
  return Number(rows[0]?.count ?? 0);
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  // Secure would make the cookie undeliverable over plain http://localhost
  // during development, so it is tied to NODE_ENV rather than always on.
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

/** Constant-time compare for CSRF tokens and similar fixed-length values. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
