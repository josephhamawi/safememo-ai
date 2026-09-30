/**
 * Agents, conversations, and messages.
 *
 * Every query filters on user_id from the session. Ownership is part of the
 * WHERE clause, never a post-fetch check, so there is no path that reads a
 * row belonging to someone else and then decides what to do about it.
 */

import { Router } from 'express';
import { z } from 'zod';

import { query, queryOne } from '../db';
import { requireUser } from '../middleware/auth';
import { PROVIDERS, isProviderId } from '../providers/registry';

export const agentsRouter = Router();

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const createSchema = z.object({
  name: z.string().min(1).max(120),
  systemPrompt: z.string().max(100_000).optional(),
  provider: z.string().refine(isProviderId, 'Unknown provider').default('anthropic'),
  model: z.string().min(1).max(120).optional(),
  maxTokens: z.number().int().min(1).max(128_000).default(4096),
  effort: z.enum(EFFORTS).optional(),
});

const updateSchema = createSchema.partial();

interface AgentRow {
  id: string;
  name: string;
  system_prompt: string | null;
  provider: string;
  model: string;
  max_tokens: number;
  effort: string | null;
  created_at: Date;
  updated_at: Date;
}

function toAgent(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    provider: row.provider,
    model: row.model,
    maxTokens: row.max_tokens,
    effort: row.effort,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const AGENT_COLUMNS =
  'id, name, system_prompt, provider, model, max_tokens, effort, created_at, updated_at';

agentsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const rows = await query<AgentRow>(
      `SELECT ${AGENT_COLUMNS} FROM agents
        WHERE user_id = $1 AND archived_at IS NULL
        ORDER BY created_at ASC`,
      [req.user!.id],
    );
    res.json({ agents: rows.map(toAgent) });
  } catch (err) {
    next(err);
  }
});

agentsRouter.post('/', requireUser, async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const input = parsed.data;
  const provider = input.provider as keyof typeof PROVIDERS;

  try {
    // An agent pointed at a provider with no stored key would fail on its
    // first message. Refuse up front and say which key is missing.
    const hasKey = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM provider_credentials
          WHERE user_id = $1 AND provider = $2 AND verified_at IS NOT NULL
       ) AS exists`,
      [req.user!.id, provider],
    );

    if (!hasKey?.exists) {
      res.status(409).json({
        error: `Add ${/^[AEIOU]/i.test(PROVIDERS[provider].label) ? 'an' : 'a'} ${PROVIDERS[provider].label} API key before creating an agent that uses it.`,
        reason: 'missing_credential',
        provider,
      });
      return;
    }

    const rows = await query<AgentRow>(
      `INSERT INTO agents
         (user_id, name, system_prompt, provider, model, max_tokens, effort)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${AGENT_COLUMNS}`,
      [
        req.user!.id,
        input.name,
        input.systemPrompt ?? null,
        provider,
        input.model ?? PROVIDERS[provider].defaultModel,
        input.maxTokens,
        input.effort ?? null,
      ],
    );

    res.status(201).json({ agent: toAgent(rows[0]!) });
  } catch (err) {
    next(err);
  }
});

agentsRouter.get('/:id', requireUser, async (req, res, next) => {
  try {
    const row = await queryOne<AgentRow>(
      `SELECT ${AGENT_COLUMNS} FROM agents
        WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
      [req.params.id, req.user!.id],
    );
    if (!row) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agent: toAgent(row) });
  } catch (err) {
    next(err);
  }
});

agentsRouter.patch('/:id', requireUser, async (req, res, next) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const input = parsed.data;

  try {
    // COALESCE keeps omitted fields untouched without building dynamic SQL.
    const rows = await query<AgentRow>(
      `UPDATE agents SET
         name          = COALESCE($3, name),
         system_prompt = COALESCE($4, system_prompt),
         provider      = COALESCE($5, provider),
         model         = COALESCE($6, model),
         max_tokens    = COALESCE($7, max_tokens),
         effort        = COALESCE($8, effort),
         updated_at    = now()
       WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
       RETURNING ${AGENT_COLUMNS}`,
      [
        req.params.id,
        req.user!.id,
        input.name ?? null,
        input.systemPrompt ?? null,
        input.provider ?? null,
        input.model ?? null,
        input.maxTokens ?? null,
        input.effort ?? null,
      ],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ agent: toAgent(rows[0]!) });
  } catch (err) {
    next(err);
  }
});

agentsRouter.delete('/:id', requireUser, async (req, res, next) => {
  try {
    // Archive rather than delete: conversations and audit entries reference
    // this agent, and the chain must stay verifiable.
    const rows = await query<{ id: string }>(
      `UPDATE agents SET archived_at = now()
        WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
        RETURNING id`,
      [req.params.id, req.user!.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

agentsRouter.get('/:id/conversations', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{
      id: string;
      title: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, title, created_at, updated_at
         FROM conversations
        WHERE agent_id = $1 AND user_id = $2
        ORDER BY updated_at DESC
        LIMIT 100`,
      [req.params.id, req.user!.id],
    );

    res.json({
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export const conversationsRouter = Router();

conversationsRouter.get('/:id/messages', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{
      id: string;
      role: string;
      content: string;
      tool_calls: unknown;
      created_at: Date;
    }>(
      `SELECT id, role, content, tool_calls, created_at
         FROM messages
        WHERE conversation_id = $1 AND user_id = $2
        ORDER BY created_at ASC
        LIMIT 500`,
      [req.params.id, req.user!.id],
    );

    res.json({
      messages: rows.map((r) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        toolCalls: r.tool_calls,
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});
