/**
 * Semantic memory and the validation queue.
 *
 * Approval is the product's whole claim: nothing reaches long-term memory
 * without a recorded human decision. The promote-and-audit step runs in one
 * transaction so a memory can never exist without the chain entry that
 * explains how it got there.
 */

import { Router } from 'express';
import { z } from 'zod';

import { query, queryOne, transaction } from '../db';
import { searchMemories } from '../agents/tools';
import { appendAudit, verifyChain } from '../lib/audit';
import { requireUser } from '../middleware/auth';

export const memoriesRouter = Router();

interface MemoryRow {
  id: string;
  agent_id: string;
  content: string;
  tags: string[];
  confidence: number | null;
  source: string | null;
  approved_at: Date | null;
  created_at: Date;
}

function toMemory(row: MemoryRow) {
  return {
    id: row.id,
    agentId: row.agent_id,
    content: row.content,
    tags: row.tags,
    confidence: row.confidence,
    source: row.source,
    approvedAt: row.approved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

const listSchema = z.object({
  agentId: z.string().uuid().optional(),
  search: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

memoriesRouter.get('/', requireUser, async (req, res, next) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query' });
    return;
  }
  const { agentId, search, limit } = parsed.data;

  try {
    // A search with an agent scope goes through the vector path; a plain
    // listing does not need embeddings at all.
    if (search && agentId) {
      const hits = await searchMemories(req.user!.id, agentId, search, limit);
      res.json({ memories: hits });
      return;
    }

    const rows = await query<MemoryRow>(
      `SELECT id, agent_id, content, tags, confidence, source, approved_at, created_at
         FROM semantic_memories
        WHERE user_id = $1
          AND purged_at IS NULL
          AND ($2::uuid IS NULL OR agent_id = $2)
          AND ($3::text IS NULL OR content ILIKE '%' || $3 || '%')
        ORDER BY created_at DESC
        LIMIT $4`,
      [req.user!.id, agentId ?? null, search ?? null, limit],
    );

    res.json({ memories: rows.map(toMemory) });
  } catch (err) {
    next(err);
  }
});

/**
 * Right to erasure. The memory row is soft-deleted and its embedding dropped,
 * while the audit chain keeps the record that a deletion happened — erasing
 * the content without erasing the evidence of the erasure.
 */
memoriesRouter.delete('/:id', requireUser, async (req, res, next) => {
  try {
    const removed = await transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `UPDATE semantic_memories
            SET purged_at = now(), content = '[purged]', embedding = NULL
          WHERE id = $1 AND user_id = $2 AND purged_at IS NULL
          RETURNING id`,
        [req.params.id, req.user!.id],
      );
      if (rows.length === 0) return false;

      await appendAudit(client, {
        userId: req.user!.id,
        chainKey: rows[0]!.id,
        action: 'memory.purged',
        actorId: req.user!.id,
        payload: { reason: 'user requested erasure' },
      });

      return true;
    });

    if (!removed) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** L3 episodic log — one entry per completed agent run. */
memoriesRouter.get('/episodic', requireUser, async (req, res, next) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : null;

  try {
    const rows = await query<{
      id: string;
      agent_id: string;
      summary: string;
      detail: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, agent_id, summary, detail, created_at
         FROM episodic_memories
        WHERE user_id = $1 AND ($2::uuid IS NULL OR agent_id = $2)
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.user!.id, agentId],
    );

    res.json({
      // Flattened into the shape the explorer renders. `detail` is kept as
      // the raw record so nothing is lost if a field is added later.
      episodes: rows.map((r) => {
        const detail = r.detail as {
          toolsUsed?: string[];
          stopReason?: string;
          durationMs?: number;
          conversationId?: string;
        };
        return {
          id: r.id,
          episodeId: r.id,
          agentId: r.agent_id,
          summary: r.summary,
          taskDomain: detail.stopReason ?? 'general',
          outcome: detail.stopReason === 'end_turn' ? 'success' : 'partial',
          duration: detail.durationMs ?? 0,
          lessonsLearned: [] as string[],
          toolCalls: (detail.toolsUsed ?? []).map((name) => ({ toolName: name })),
          sessionSnapshot: {
            summary: r.summary,
            sessionId: detail.conversationId ?? null,
            toolsUsed: detail.toolsUsed ?? [],
            messageCount: 0,
          },
          detail,
          createdAt: r.created_at.toISOString(),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

/** Full export — the "your data is yours" affordance. */
memoriesRouter.get('/export', requireUser, async (req, res, next) => {
  try {
    const rows = await query<MemoryRow>(
      `SELECT id, agent_id, content, tags, confidence, source, approved_at, created_at
         FROM semantic_memories
        WHERE user_id = $1 AND purged_at IS NULL
        ORDER BY created_at ASC`,
      [req.user!.id],
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="safememo-memories.json"',
    );
    res.json({ exportedAt: new Date().toISOString(), memories: rows.map(toMemory) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Validation queue
// ---------------------------------------------------------------------------

export const validationRouter = Router();

interface StagingRow {
  id: string;
  agent_id: string;
  content: string;
  tags: string[];
  confidence: number | null;
  source: string | null;
  flags: unknown;
  created_at: Date;
}

validationRouter.get('/', requireUser, async (req, res, next) => {
  try {
    const rows = await query<StagingRow>(
      `SELECT id, agent_id, content, tags, confidence, source, flags, created_at
         FROM staging_memories
        WHERE user_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 200`,
      [req.user!.id],
    );

    res.json({
      pending: rows.map((r) => ({
        id: r.id,
        agentId: r.agent_id,
        content: r.content,
        tags: r.tags,
        confidence: r.confidence,
        source: r.source,
        flags: r.flags,
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(2_000).optional(),
});

validationRouter.post('/:id/decide', requireUser, async (req, res, next) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'decision must be "approve" or "reject"' });
    return;
  }
  const { decision, reason } = parsed.data;
  const userId = req.user!.id;

  try {
    const result = await transaction(async (client) => {
      // Lock the row so two reviewers cannot both decide it.
      const { rows } = await client.query<{
        id: string;
        agent_id: string;
        content: string;
        tags: string[];
        confidence: number | null;
        embedding: string | null;
        source: string | null;
      }>(
        `SELECT id, agent_id, content, tags, confidence, embedding::text, source
           FROM staging_memories
          WHERE id = $1 AND user_id = $2 AND status = 'pending'
          FOR UPDATE`,
        [req.params.id, userId],
      );

      const staged = rows[0];
      if (!staged) return null;

      await client.query(
        `UPDATE staging_memories
            SET status = $2, decided_by = $3, decided_at = now(), decision_reason = $4
          WHERE id = $1`,
        [staged.id, decision === 'approve' ? 'approved' : 'rejected', userId, reason ?? null],
      );

      let promotedId: string | null = null;

      if (decision === 'approve') {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO semantic_memories
             (user_id, agent_id, content, tags, confidence, embedding, source,
              approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, now())
           RETURNING id`,
          [
            userId,
            staged.agent_id,
            staged.content,
            staged.tags,
            staged.confidence,
            staged.embedding,
            staged.source,
            userId,
          ],
        );
        promotedId = inserted.rows[0]!.id;
      }

      // Chained under the staging id so the trail reads start-to-finish:
      // staged -> approved/rejected -> (later) purged.
      await appendAudit(client, {
        userId,
        chainKey: staged.id,
        action: decision === 'approve' ? 'memory.approved' : 'memory.rejected',
        actorId: userId,
        payload: {
          content: staged.content,
          reason: reason ?? null,
          promotedId,
        },
      });

      return { promotedId };
    });

    if (!result) {
      res.status(404).json({ error: 'No pending memory with that id' });
      return;
    }

    res.json({ ok: true, promotedId: result.promotedId });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const auditRouter = Router();

auditRouter.get('/:chainKey', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{
      id: string;
      action: string;
      actor_id: string | null;
      payload: Record<string, unknown>;
      prev_hash: Buffer | null;
      entry_hash: Buffer;
      created_at: Date;
    }>(
      `SELECT id, action, actor_id, payload, prev_hash, entry_hash, created_at
         FROM audit_logs
        WHERE chain_key = $1 AND user_id = $2
        ORDER BY id ASC`,
      [req.params.chainKey, req.user!.id],
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'No audit trail for that record' });
      return;
    }

    res.json({
      chainKey: req.params.chainKey,
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actor_id,
        payload: r.payload,
        prevHash: r.prev_hash?.toString('hex') ?? null,
        entryHash: r.entry_hash.toString('hex'),
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Recompute every link. This is what an auditor actually runs. */
auditRouter.get('/:chainKey/verify', requireUser, async (req, res, next) => {
  // noUncheckedIndexedAccess types route params as possibly-undefined; the
  // matcher guarantees it, but narrow explicitly rather than asserting.
  const chainKey = req.params.chainKey;
  if (!chainKey) {
    res.status(400).json({ error: 'chainKey is required' });
    return;
  }

  try {
    const owns = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM audit_logs WHERE chain_key = $1 AND user_id = $2
       ) AS exists`,
      [chainKey, req.user!.id],
    );
    if (!owns?.exists) {
      res.status(404).json({ error: 'No audit trail for that record' });
      return;
    }

    const result = await transaction((client) => verifyChain(client, chainKey));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Signed share links
// ---------------------------------------------------------------------------
//
// An auditor or outside counsel needs to see one memory's lineage without an
// account. The token is HMAC-signed *and* backed by a row, so unlike the
// Firebase version a single link can be revoked without rotating the secret
// and invalidating everyone else's.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

const MAX_TTL_DAYS = 30;
const DEFAULT_TTL_DAYS = 7;

function signShareToken(payload: string): string {
  return createHmac('sha256', env.AUDIT_SHARE_SECRET)
    .update(payload)
    .digest('base64url');
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

const shareSchema = z.object({
  chainKey: z.string().min(1).max(200),
  ttlDays: z.number().int().min(1).max(MAX_TTL_DAYS).default(DEFAULT_TTL_DAYS),
});

auditRouter.post('/share', requireUser, async (req, res, next) => {
  const parsed = shareSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'chainKey is required' });
    return;
  }
  const { chainKey, ttlDays } = parsed.data;

  try {
    const owns = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM audit_logs WHERE chain_key = $1 AND user_id = $2
       ) AS exists`,
      [chainKey, req.user!.id],
    );
    if (!owns?.exists) {
      res.status(404).json({ error: 'No audit trail for that record' });
      return;
    }

    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const nonce = randomBytes(24).toString('base64url');
    const body = `${chainKey}.${expiresAt.getTime()}.${nonce}`;
    const token = `${Buffer.from(body, 'utf8').toString('base64url')}.${signShareToken(body)}`;

    await query(
      `INSERT INTO audit_shares (user_id, chain_key, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [req.user!.id, chainKey, hashToken(token), expiresAt],
    );

    res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

/** Public. The token is the only credential; no session is required. */
auditRouter.get('/share/view', async (req, res, next) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).json({ error: 'token is required' });
    return;
  }

  try {
    const [encodedBody, signature] = token.split('.');
    if (!encodedBody || !signature) {
      res.status(400).json({ error: 'Malformed link' });
      return;
    }

    const body = Buffer.from(encodedBody, 'base64url').toString('utf8');
    const expected = signShareToken(body);

    // Constant-time compare; a length mismatch short-circuits because
    // timingSafeEqual throws on differing lengths.
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'This link is not valid' });
      return;
    }

    // The signature proves the token was minted here; the row proves it has
    // not since been revoked. Both are required.
    const share = await queryOne<{
      chain_key: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT chain_key, expires_at, revoked_at
         FROM audit_shares WHERE token_hash = $1`,
      [hashToken(token)],
    );

    if (!share || share.revoked_at) {
      res.status(403).json({ error: 'This link has been revoked' });
      return;
    }
    if (share.expires_at.getTime() <= Date.now()) {
      res.status(403).json({ error: 'This link has expired' });
      return;
    }

    const entries = await query<{
      id: string;
      action: string;
      payload: Record<string, unknown>;
      prev_hash: Buffer | null;
      entry_hash: Buffer;
      created_at: Date;
    }>(
      `SELECT id, action, payload, prev_hash, entry_hash, created_at
         FROM audit_logs WHERE chain_key = $1 ORDER BY id ASC`,
      [share.chain_key],
    );

    const verification = await transaction((client) =>
      verifyChain(client, share.chain_key),
    );

    res.json({
      chainKey: share.chain_key,
      expiresAt: share.expires_at.toISOString(),
      verification,
      entries: entries.map((r) => ({
        id: r.id,
        action: r.action,
        // actorId is withheld: an external auditor needs the lineage, not
        // the internal user ids of everyone who touched it.
        payload: r.payload,
        prevHash: r.prev_hash?.toString('hex') ?? null,
        entryHash: r.entry_hash.toString('hex'),
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

auditRouter.post('/share/:id/revoke', requireUser, async (req, res, next) => {
  try {
    const rows = await query<{ id: string }>(
      `UPDATE audit_shares SET revoked_at = now()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [req.params.id, req.user!.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Share link not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
