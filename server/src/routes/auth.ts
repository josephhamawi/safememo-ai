/**
 * Email + password authentication.
 *
 * Firebase Auth is gone with the Firebase project, so this owns account
 * creation, password verification, and session issuance.
 */

import argon2 from 'argon2';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { query, queryOne, transaction } from '../db';
import { env } from '../env';
import { ACCOUNT_CHAIN, appendAudit } from '../lib/audit';
import {
  clearedSessionCookie,
  createSession,
  destroySession,
  sessionCookie,
} from '../lib/session';
import { requireUser } from '../middleware/auth';
import { hasAnyCredential } from '../providers/credentialStore';

export const authRouter = Router();

/**
 * Argon2id at OWASP's 2024 baseline. Deliberately slow — this is the cost
 * that makes an offline crack of a leaked hash table impractical.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  // 12 chars minimum with no composition rules: length beats character-class
  // theatre, which mostly produces "Password1!".
  password: z.string().min(12).max(1024),
  displayName: z.string().max(80).optional(),
});

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  is_admin: boolean;
}

async function issueSession(
  res: import('express').Response,
  req: import('express').Request,
  userId: string,
): Promise<void> {
  const { token, expiresAt } = await createSession(userId, {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
  res.setHeader('Set-Cookie', sessionCookie(token, expiresAt));
}

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

authRouter.post('/signup', authLimiter, async (req, res, next) => {
  if (env.SIGNUP_MODE === 'closed') {
    res.status(403).json({ error: 'Sign-up is disabled on this instance' });
    return;
  }

  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid email or password',
    });
    return;
  }

  const { email, password, displayName } = parsed.data;

  try {
    if (env.SIGNUP_MODE === 'invite') {
      const invited = await queryOne<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM users WHERE lower(email) = lower($1)
         ) AS exists`,
        [email],
      );
      // In invite mode an admin pre-creates the row with a null password hash.
      if (!invited?.exists) {
        res.status(403).json({ error: 'This instance is invite-only' });
        return;
      }
    }

    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    const result = await transaction(async (client) => {
      const existing = await client.query<UserRow>(
        'SELECT id, password_hash FROM users WHERE lower(email) = lower($1)',
        [email],
      );

      const alreadyActive = existing.rows[0]?.password_hash != null;
      if (alreadyActive) return null;

      const { rows } = existing.rowCount
        ? await client.query<UserRow>(
            `UPDATE users
                SET password_hash = $2, display_name = COALESCE($3, display_name),
                    updated_at = now()
              WHERE lower(email) = lower($1)
              RETURNING id, email, display_name, is_admin, password_hash`,
            [email, passwordHash, displayName ?? null],
          )
        : await client.query<UserRow>(
            `INSERT INTO users (email, password_hash, display_name)
             VALUES ($1, $2, $3)
             RETURNING id, email, display_name, is_admin, password_hash`,
            [email, passwordHash, displayName ?? null],
          );

      const user = rows[0]!;

      await appendAudit(client, {
        userId: user.id,
        chainKey: ACCOUNT_CHAIN,
        action: 'account.created',
        actorId: user.id,
        payload: { email: user.email },
      });

      return user;
    });

    if (!result) {
      // Account exists. Same shape and timing as success would be ideal; the
      // signup form has to say something, so this leaks existence by design.
      // Do not copy this response into the login handler.
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }

    await issueSession(res, req, result.id);

    res.status(201).json({
      user: {
        id: result.id,
        email: result.email,
        displayName: result.display_name,
        isAdmin: result.is_admin,
      },
      // The web app reads this and routes straight to the key setup step.
      needsApiKey: true,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post('/login', authLimiter, async (req, res, next) => {
  const parsed = z
    .object({ email: z.string().max(254), password: z.string().max(1024) })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await queryOne<UserRow>(
      `SELECT id, email, password_hash, display_name, is_admin
         FROM users WHERE lower(email) = lower($1)`,
      [email],
    );

    // Hash even when the user does not exist, so response time does not
    // reveal which emails are registered.
    const hash = user?.password_hash ?? (await unknownUserDecoyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);

    if (!user || !user.password_hash || !valid) {
      res.status(401).json({ error: 'Incorrect email or password' });
      return;
    }

    await issueSession(res, req, user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin,
      },
      needsApiKey: !(await hasAnyCredential(user.id)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * A fixed Argon2 hash of a random value, computed once per process, so the
 * unknown-user path costs the same as the known-user path.
 */
let decoyHash: Promise<string> | undefined;
function unknownUserDecoyHash(): Promise<string> {
  decoyHash ??= argon2.hash('decoy-' + Math.random().toString(36), ARGON2_OPTIONS);
  return decoyHash;
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

authRouter.post('/logout', async (req, res, next) => {
  try {
    if (req.sessionToken) await destroySession(req.sessionToken);
    res.setHeader('Set-Cookie', clearedSessionCookie());
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

authRouter.get('/me', requireUser, async (req, res, next) => {
  try {
    res.json({
      user: req.user,
      // Drives the onboarding gate in the web app on every page load, so a
      // user who deletes their only key is sent back to set one up.
      needsApiKey: !(await hasAnyCredential(req.user!.id)),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout-all — invalidate every session for this user
// ---------------------------------------------------------------------------

authRouter.post('/logout-all', requireUser, async (req, res, next) => {
  try {
    await query('DELETE FROM sessions WHERE user_id = $1', [req.user!.id]);
    res.setHeader('Set-Cookie', clearedSessionCookie());
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
