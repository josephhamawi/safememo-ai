/**
 * Notifications, custom slash commands, user profile, usage, and the public
 * early-access form.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { query, queryOne } from '../db';
import { requireUser } from '../middleware/auth';
import { usageToday } from '../lib/usage';

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsRouter = Router();

notificationsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{
      id: string;
      kind: string;
      title: string;
      body: string | null;
      link: string | null;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, kind, title, body, link, read_at, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.user!.id],
    );

    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        link: r.link,
        read: r.read_at != null,
        createdAt: r.created_at.toISOString(),
      })),
      unreadCount: rows.filter((r) => r.read_at == null).length,
    });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/:id/read', requireUser, async (req, res, next) => {
  try {
    await query(
      `UPDATE notifications SET read_at = now()
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [req.params.id, req.user!.id],
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post('/read-all', requireUser, async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [req.user!.id],
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Custom slash commands
// ---------------------------------------------------------------------------

export const commandsRouter = Router();

const commandSchema = z.object({
  // Lowercase slug: it is typed after a slash, so spaces and capitals would
  // make it unreachable.
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'Use lowercase letters, digits, - or _'),
  description: z.string().max(200).optional(),
  prompt: z.string().min(1).max(20_000),
});

commandsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{
      id: string;
      name: string;
      description: string | null;
      prompt: string;
    }>(
      `SELECT id, name, description, prompt FROM custom_commands
        WHERE user_id = $1 ORDER BY name ASC`,
      [req.user!.id],
    );
    res.json({ commands: rows });
  } catch (err) {
    next(err);
  }
});

commandsRouter.put('/', requireUser, async (req, res, next) => {
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }
  const { name, description, prompt } = parsed.data;

  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO custom_commands (user_id, name, description, prompt)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, name) DO UPDATE
         SET description = EXCLUDED.description,
             prompt      = EXCLUDED.prompt,
             updated_at  = now()
       RETURNING id`,
      [req.user!.id, name, description ?? null, prompt],
    );
    res.json({ id: rows[0]!.id, name });
  } catch (err) {
    next(err);
  }
});

commandsRouter.delete('/:name', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{ id: string }>(
      'DELETE FROM custom_commands WHERE user_id = $1 AND name = $2 RETURNING id',
      [req.user!.id, req.params.name],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Command not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Profile and usage
// ---------------------------------------------------------------------------

export const profileRouter = Router();

profileRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const row = await queryOne<{
      id: string;
      email: string;
      display_name: string | null;
      onboarding_completed: boolean;
      preferences: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, email, display_name, onboarding_completed, preferences, created_at
         FROM users WHERE id = $1`,
      [req.user!.id],
    );

    if (!row) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json({
      profile: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        onboardingCompleted: row.onboarding_completed,
        preferences: row.preferences,
        createdAt: row.created_at.toISOString(),
      },
      usage: await usageToday(req.user!.id),
    });
  } catch (err) {
    next(err);
  }
});

const profileUpdateSchema = z.object({
  displayName: z.string().max(80).nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
  preferences: z.record(z.unknown()).optional(),
});

profileRouter.patch('/', requireUser, async (req, res, next) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  const input = parsed.data;

  try {
    await query(
      `UPDATE users SET
         display_name         = COALESCE($2, display_name),
         onboarding_completed = COALESCE($3, onboarding_completed),
         preferences          = COALESCE($4::jsonb, preferences),
         updated_at           = now()
       WHERE id = $1`,
      [
        req.user!.id,
        input.displayName ?? null,
        input.onboardingCompleted ?? null,
        input.preferences ? JSON.stringify(input.preferences) : null,
      ],
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export const usageRouter = Router();

usageRouter.get('/today', requireUser, async (req, res, next) => {
  try {
    res.json(await usageToday(req.user!.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Early access (public)
// ---------------------------------------------------------------------------

export const earlyAccessRouter = Router();

/**
 * Unauthenticated by necessity, so it is rate-limited by IP. The Firestore
 * rule this replaces allowed anonymous writes with size checks on only four
 * named fields — an attacker could attach an unchecked 900 KB field and write
 * unbounded documents. Here the columns define the shape.
 */
const earlyAccessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

const earlyAccessSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(200).optional(),
  organization: z.string().max(200).optional(),
  useCase: z.string().max(2000).optional(),
});

earlyAccessRouter.post('/', earlyAccessLimiter, async (req, res, next) => {
  const parsed = earlyAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A valid email is required' });
    return;
  }
  const { email, name, organization, useCase } = parsed.data;

  try {
    await query(
      `INSERT INTO early_access_requests (email, name, organization, use_case)
       VALUES ($1, $2, $3, $4)`,
      [email.toLowerCase(), name ?? null, organization ?? null, useCase ?? null],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
