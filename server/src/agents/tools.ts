/**
 * Tool registry for the agent loop.
 *
 * Every tool is scoped to the calling user at execution time — handlers
 * receive the userId from the session, never from model-supplied input, so a
 * model cannot address another tenant's data by writing a different id into a
 * tool call.
 */

import { z } from 'zod';

import { query, transaction } from '../db';
import { asQuery } from '../embeddings/local';
import { toVectorLiteral, tryEmbed } from '../embeddings';
import { appendAudit } from '../lib/audit';
import type { AgentConfig } from './types';

export interface ToolContext {
  userId: string;
  agent: AgentConfig;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Runtime validation; model output is never trusted to match the schema. */
  parse: (input: unknown) => unknown;
  execute: (input: never, ctx: ToolContext) => Promise<ToolResult>;
}

function ok(content: string): ToolResult {
  return { content, isError: false };
}

function fail(content: string): ToolResult {
  return { content, isError: true };
}

// ---------------------------------------------------------------------------
// memory_search
// ---------------------------------------------------------------------------

const memorySearchSchema = z.object({
  query: z.string().min(1).max(1_000),
  limit: z.number().int().min(1).max(20).default(5),
});

const memorySearch: ToolDefinition = {
  name: 'memory_search',
  description:
    'Search this user\'s validated long-term memory for facts relevant to a query. ' +
    'Call it when the answer may depend on something the user told you in an earlier session.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for' },
      limit: { type: 'integer', description: 'Max results (default 5)' },
    },
    required: ['query'],
  },
  parse: (input) => memorySearchSchema.parse(input),
  execute: async (input: z.infer<typeof memorySearchSchema>, ctx) => {
    const rows = await searchMemories(
      ctx.userId,
      ctx.agent.id,
      input.query,
      input.limit,
    );

    if (rows.length === 0) return ok('No matching memories.');

    return ok(
      rows
        .map((r, i) => {
          const confidence =
            r.confidence != null ? ` (confidence ${r.confidence.toFixed(2)})` : '';
          return `${i + 1}. ${r.content}${confidence}`;
        })
        .join('\n'),
    );
  },
};

interface MemoryHit {
  id: string;
  content: string;
  confidence: number | null;
}

/**
 * Semantic search with a lexical fallback.
 *
 * Cosine distance over pgvector when embeddings are available; ILIKE when
 * they are not. The fallback exists because the local ONNX backend cannot
 * load on every platform (see embeddings/local.ts) — degraded recall is
 * better than a tool that errors.
 */
export async function searchMemories(
  userId: string,
  agentId: string,
  searchText: string,
  limit: number,
): Promise<MemoryHit[]> {
  const embedded = await tryEmbed([asQuery(searchText)], { userId });
  const vector = embedded?.[0];

  if (vector) {
    // `<=>` is cosine distance: smaller is closer. The HNSW index on
    // semantic_memories.embedding serves this ordering.
    return query<MemoryHit>(
      `SELECT id, content, confidence
         FROM semantic_memories
        WHERE user_id = $1
          AND agent_id = $2
          AND purged_at IS NULL
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $3::vector
        LIMIT $4`,
      [userId, agentId, toVectorLiteral(vector), limit],
    );
  }

  return query<MemoryHit>(
    `SELECT id, content, confidence
       FROM semantic_memories
      WHERE user_id = $1
        AND agent_id = $2
        AND purged_at IS NULL
        AND content ILIKE '%' || $3 || '%'
      ORDER BY confidence DESC NULLS LAST, created_at DESC
      LIMIT $4`,
    [userId, agentId, searchText, limit],
  );
}

// ---------------------------------------------------------------------------
// memory_note
// ---------------------------------------------------------------------------

const memoryNoteSchema = z.object({
  fact: z.string().min(3).max(2_000),
  tags: z.array(z.string().max(40)).max(10).default([]),
});

const memoryNote: ToolDefinition = {
  name: 'memory_note',
  description:
    'Record a fact worth remembering long-term. It enters the validation queue ' +
    'for human review and does not become permanent memory until approved.',
  inputSchema: {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description: 'A single concrete fact, in the third person',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional topic tags',
      },
    },
    required: ['fact'],
  },
  parse: (input) => memoryNoteSchema.parse(input),
  execute: async (input: z.infer<typeof memoryNoteSchema>, ctx) => {
    // Embedded at write time so the validation gate can run dedup and
    // contradiction checks against existing memories without a second pass.
    // Stored documents get no query prefix — bge expects it on queries only.
    const embedded = await tryEmbed([input.fact], { userId: ctx.userId });
    const vector = embedded?.[0] ? toVectorLiteral(embedded[0]) : null;

    const id = await transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO staging_memories
           (user_id, agent_id, content, tags, confidence, source, status, embedding)
         VALUES ($1, $2, $3, $4, $5, 'agent', 'pending', $6::vector)
         RETURNING id`,
        [ctx.userId, ctx.agent.id, input.fact, input.tags, 0.9, vector],
      );
      const memoryId = rows[0]!.id;

      await appendAudit(client, {
        userId: ctx.userId,
        chainKey: memoryId,
        action: 'memory.staged',
        actorId: null, // proposed by the agent, not a person
        payload: { content: input.fact, tags: input.tags, agentId: ctx.agent.id },
      });

      return memoryId;
    });

    return ok(`Staged for review (id ${id}).`);
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: ToolDefinition[] = [memorySearch, memoryNote];

export function availableTools(): ToolDefinition[] {
  return REGISTRY;
}

export function findTool(name: string): ToolDefinition | undefined {
  return REGISTRY.find((t) => t.name === name);
}

/**
 * Execute one tool call. Never throws — a tool failure is returned to the
 * model as an error result so it can adapt, which is more useful than
 * collapsing the whole run.
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = findTool(name);
  if (!tool) return fail(`Unknown tool "${name}".`);

  let input: unknown;
  try {
    input = tool.parse(rawInput);
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : 'invalid input';
    return fail(`Invalid arguments for ${name}: ${message}`);
  }

  try {
    return await (tool.execute as (i: unknown, c: ToolContext) => Promise<ToolResult>)(
      input,
      ctx,
    );
  } catch (err) {
    console.error(`[tool:${name}] execution failed`, err);
    // The model sees a generic failure; the detail stays in the server log so
    // a database error message cannot be reflected back through the model.
    return fail(`${name} failed to execute.`);
  }
}
