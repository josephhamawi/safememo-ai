import { query, queryOne } from '../db';
import type {
  AgentConfig,
  EpisodicMemoryRef,
  MemoryContext,
  SemanticMemoryRef,
  TranscriptMessage,
} from './types';

/** Recent turns replayed into the prompt for continuity. */
const WORKING_MEMORY_TURNS = 20;
const SEMANTIC_LIMIT = 20;
const EPISODIC_LIMIT = 5;

/**
 * Load an agent, scoped to its owner.
 *
 * user_id is part of the WHERE clause rather than checked after the fetch —
 * ownership is enforced by the query, so there is no code path that reads a
 * row first and decides later.
 */
export async function loadAgent(
  userId: string,
  agentId: string,
): Promise<AgentConfig | undefined> {
  const row = await queryOne<{
    id: string;
    user_id: string;
    name: string;
    system_prompt: string | null;
    provider: AgentConfig['provider'];
    model: string;
    max_tokens: number;
    effort: AgentConfig['effort'];
  }>(
    `SELECT id, user_id, name, system_prompt, provider, model, max_tokens, effort
       FROM agents
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [agentId, userId],
  );

  if (!row) return undefined;

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    systemPrompt: row.system_prompt,
    provider: row.provider,
    model: row.model,
    maxTokens: row.max_tokens,
    effort: row.effort,
  };
}

export async function loadMemoryContext(
  userId: string,
  agentId: string,
  conversationId: string,
): Promise<MemoryContext> {
  const [working, semantic, episodic] = await Promise.all([
    loadWorkingMemory(userId, conversationId),
    loadSemanticMemory(userId, agentId),
    loadEpisodicMemory(userId, agentId),
  ]);

  return { working, semantic, episodic };
}

async function loadWorkingMemory(
  userId: string,
  conversationId: string,
): Promise<TranscriptMessage[]> {
  const rows = await query<{ role: 'user' | 'assistant' | 'system'; content: string }>(
    `SELECT role, content FROM (
       SELECT role, content, created_at
         FROM messages
        WHERE user_id = $1 AND conversation_id = $2
        ORDER BY created_at DESC
        LIMIT $3
     ) recent ORDER BY created_at ASC`,
    [userId, conversationId, WORKING_MEMORY_TURNS],
  );

  // System rows are not replayed as conversation turns — the system prompt is
  // rebuilt fresh on every run.
  return rows
    .filter((r): r is { role: 'user' | 'assistant'; content: string } =>
      r.role === 'user' || r.role === 'assistant',
    )
    .map((r) => ({ role: r.role, content: r.content }));
}

async function loadSemanticMemory(
  userId: string,
  agentId: string,
): Promise<SemanticMemoryRef[]> {
  // Highest-confidence validated facts. Replaced by a pgvector similarity
  // search against the incoming message once embeddings are wired up.
  const rows = await query<{
    id: string;
    content: string;
    confidence: number | null;
    tags: string[];
  }>(
    `SELECT id, content, confidence, tags
       FROM semantic_memories
      WHERE user_id = $1 AND agent_id = $2 AND purged_at IS NULL
      ORDER BY confidence DESC NULLS LAST, created_at DESC
      LIMIT $3`,
    [userId, agentId, SEMANTIC_LIMIT],
  );

  return rows;
}

async function loadEpisodicMemory(
  userId: string,
  agentId: string,
): Promise<EpisodicMemoryRef[]> {
  const rows = await query<{ id: string; summary: string; created_at: Date }>(
    `SELECT id, summary, created_at
       FROM episodic_memories
      WHERE user_id = $1 AND agent_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [userId, agentId, EPISODIC_LIMIT],
  );

  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Persistence after a run
// ---------------------------------------------------------------------------

export async function persistTurn(params: {
  userId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  toolCalls: unknown[];
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  await query(
    `INSERT INTO messages (user_id, conversation_id, role, content)
     VALUES ($1, $2, 'user', $3)`,
    [params.userId, params.conversationId, params.userMessage],
  );

  await query(
    `INSERT INTO messages
       (user_id, conversation_id, role, content, tool_calls, input_tokens, output_tokens)
     VALUES ($1, $2, 'assistant', $3, $4, $5, $6)`,
    [
      params.userId,
      params.conversationId,
      params.assistantMessage,
      JSON.stringify(params.toolCalls),
      params.inputTokens,
      params.outputTokens,
    ],
  );

  await query(
    'UPDATE conversations SET updated_at = now() WHERE id = $1 AND user_id = $2',
    [params.conversationId, params.userId],
  );
}

export async function logEpisode(params: {
  userId: string;
  agentId: string;
  summary: string;
  detail: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO episodic_memories (user_id, agent_id, summary, detail)
     VALUES ($1, $2, $3, $4)`,
    [params.userId, params.agentId, params.summary, JSON.stringify(params.detail)],
  );
}

/** Create a conversation if the id is new, otherwise assert ownership. */
export async function ensureConversation(
  userId: string,
  agentId: string,
  conversationId: string,
): Promise<boolean> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
    [conversationId, userId],
  );
  if (existing) return true;

  const conflicting = await queryOne<{ id: string }>(
    'SELECT id FROM conversations WHERE id = $1',
    [conversationId],
  );
  // Someone else's conversation id. Refuse rather than creating a duplicate
  // or leaking that the id exists.
  if (conflicting) return false;

  await query(
    `INSERT INTO conversations (id, user_id, agent_id) VALUES ($1, $2, $3)`,
    [conversationId, userId, agentId],
  );
  return true;
}
