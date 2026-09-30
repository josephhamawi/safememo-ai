/**
 * Agent tool-use loop, running on the user's own provider credential.
 *
 * Ported from the Firebase Cloud Function with three substantive changes:
 *
 *  1. One model call per iteration. The original streamed a response, threw
 *     the streamed content away, then re-issued the identical request
 *     non-streaming just to recover structured content blocks — billing every
 *     turn twice. `client.messages.stream()` gives both: deltas as they
 *     arrive, and `.finalMessage()` for the structured blocks.
 *
 *  2. No `temperature` / `top_p`. Those are rejected outright by Opus 4.7 and
 *     later, Claude Opus 5, and Claude Sonnet 5. Depth is steered with
 *     `output_config.effort` instead.
 *
 *  3. The API key is the user's, decrypted per run and zeroed in a `finally`.
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';

import { recordUsage } from '../lib/usage';
import { useCredential } from '../providers/credentialStore';
import { buildSystemPrompt } from './systemPrompt';
import { availableTools, executeTool } from './tools';
import type {
  AgentConfig,
  AgentRunResult,
  EventSink,
  MemoryContext,
  ToolInvocation,
} from './types';

const MAX_TOOL_ITERATIONS = 10;

/** Retry budget for transient upstream failures. Total wait ≈ 14s. */
const MAX_ATTEMPTS = 3;

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    // 408/409/429 and 5xx are transient; 400/401/403/404 are not and retrying
    // a rejected key just burns the user's rate limit.
    return (
      err.status === 408 ||
      err.status === 409 ||
      err.status === 429 ||
      (err.status ?? 0) >= 500
    );
  }
  return err instanceof Anthropic.APIConnectionError;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export class MissingCredentialError extends Error {
  constructor(readonly provider: string) {
    super(`No API key stored for ${provider}`);
    this.name = 'MissingCredentialError';
  }
}

export interface RunOptions {
  agent: AgentConfig;
  userId: string;
  conversationId: string;
  userMessage: string;
  memories: MemoryContext;
  onEvent?: EventSink;
  signal?: AbortSignal;
}

export async function runAgent(options: RunOptions): Promise<AgentRunResult> {
  const { agent, userId, userMessage, memories, onEvent, signal } = options;
  const startedAt = Date.now();
  const messageId = randomUUID();

  if (agent.provider !== 'anthropic') {
    // Google and OpenAI credentials can be stored and verified, but the loop
    // below is Anthropic-specific. Fail loudly rather than silently routing to
    // the wrong provider.
    throw new Error(
      `Provider "${agent.provider}" is not yet supported by the agent loop`,
    );
  }

  // Decrypted per run, zeroed below. Held only for the lifetime of this call.
  let keyBuffer: Buffer;
  try {
    keyBuffer = await useCredential(userId, agent.provider);
  } catch (err) {
    if (err instanceof Error && err.name === 'CredentialNotFoundError') {
      throw new MissingCredentialError(agent.provider);
    }
    throw err;
  }

  const tools = availableTools();
  const systemPrompt = buildSystemPrompt(agent, memories, tools);

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = [
    ...memories.working.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const toolCalls: ToolInvocation[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let finalText = '';
  let stopReason: AgentRunResult['stopReason'] = 'max_iterations';

  try {
    const client = new Anthropic({ apiKey: keyBuffer.toString('utf8') });

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      signal?.throwIfAborted();

      const stream = await withRetry(async () =>
        client.messages.stream(
          {
            model: agent.model,
            max_tokens: agent.maxTokens,
            system: systemPrompt,
            messages,
            ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
            ...(agent.effort ? { output_config: { effort: agent.effort } } : {}),
          },
          signal ? { signal } : undefined,
        ),
      );

      // Forward deltas to the caller as they arrive.
      stream.on('text', (delta) => onEvent?.({ type: 'text', text: delta }));

      // One request, both outputs — this is the fix for the double-billing.
      const message = await stream.finalMessage();

      inputTokens += message.usage.input_tokens;
      outputTokens += message.usage.output_tokens;

      if (message.stop_reason === 'refusal') {
        stopReason = 'refusal';
        finalText =
          'The model declined to answer this request. Try rephrasing, or ask something else.';
        break;
      }

      const textBlocks = message.content.filter(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      const toolUseBlocks = message.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        finalText = textBlocks.map((b) => b.text).join('\n');
        stopReason = message.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn';
        break;
      }

      // Echo the assistant turn back verbatim. Dropping or reordering blocks
      // here is what causes "tool_use ids must have matching tool_result".
      messages.push({ role: 'assistant', content: message.content });

      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        onEvent?.({ type: 'tool_start', toolName: block.name, toolId: block.id });
        const toolStartedAt = Date.now();

        const result = await executeTool(block.name, block.input, {
          userId,
          agent,
        });

        const durationMs = Date.now() - toolStartedAt;
        const status = result.isError ? 'error' : 'success';

        toolCalls.push({
          toolId: block.id,
          toolName: block.name,
          params: (block.input ?? {}) as Record<string, unknown>,
          result: result.content,
          durationMs,
          status,
        });

        onEvent?.({ type: 'tool_end', toolName: block.name, toolId: block.id, status });

        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        });
      }

      // Every tool_result for this turn goes back in a single user message.
      // Splitting them across messages trains the model out of parallel calls.
      messages.push({ role: 'user', content: results });
    }

    if (!finalText && stopReason === 'max_iterations') {
      finalText =
        `Stopped after ${MAX_TOOL_ITERATIONS} tool rounds without reaching an answer. ` +
        'Try narrowing the request.';
    }
  } finally {
    // The Buffer is wiped; the string copy handed to the SDK constructor is
    // unreachable once `client` goes out of scope but cannot be zeroed.
    keyBuffer.fill(0);
  }

  const result: AgentRunResult = {
    messageId,
    content: finalText,
    toolCalls,
    stagedMemoryIds: toolCalls
      .filter((c) => c.toolName === 'memory_note' && c.status === 'success')
      .map((c) => c.result),
    usage: { inputTokens, outputTokens },
    stopReason,
    durationMs: Date.now() - startedAt,
  };

  // Metering is best-effort: the user already paid their provider for this
  // turn, so a bookkeeping failure must not discard their answer.
  await recordUsage(userId, { inputTokens, outputTokens }).catch((err) =>
    console.error('[usage] failed to record', err),
  );

  onEvent?.({ type: 'done', result });

  return result;
}
