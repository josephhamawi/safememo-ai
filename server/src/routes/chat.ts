/**
 * Chat endpoint. Streams the agent run over Server-Sent Events.
 *
 * Replaces the Firebase pattern of writing stream tokens into Firestore for
 * the client to subscribe to — one round trip instead of a write-then-listen
 * loop, and no per-token database write.
 */

import { Router } from 'express';
import { z } from 'zod';

import {
  ensureConversation,
  loadAgent,
  loadMemoryContext,
  logEpisode,
  persistTurn,
} from '../agents/memory';
import { MissingCredentialError, runAgent } from '../agents/orchestrator';
import type { AgentEvent } from '../agents/types';
import { DailyLimitExceededError, assertWithinDailyLimit } from '../lib/usage';
import { requireUser } from '../middleware/auth';

export const chatRouter = Router();

const chatSchema = z.object({
  agentId: z.string().uuid(),
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(100_000),
});

chatRouter.post('/', requireUser, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? 'Invalid request',
    });
    return;
  }

  const userId = req.user!.id;
  const { agentId, conversationId, message } = parsed.data;

  // Everything that can fail cleanly is checked before the stream opens —
  // once SSE headers are sent, the status code is fixed at 200 and errors can
  // only be reported as events.
  try {
    await assertWithinDailyLimit(userId);
  } catch (err) {
    if (err instanceof DailyLimitExceededError) {
      res.status(429).json({ error: err.message });
      return;
    }
    throw err;
  }

  const agent = await loadAgent(userId, agentId);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  const conversationOk = await ensureConversation(userId, agentId, conversationId);
  if (!conversationOk) {
    res.status(409).json({ error: 'Conversation id is already in use' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops nginx from buffering the stream into nothing.
    'X-Accel-Buffering': 'no',
  });

  const send = (event: AgentEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Abort the upstream model call if the browser disconnects, so a closed tab
  // does not keep spending the user's tokens.
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  // SSE connections die silently through some proxies; a comment frame every
  // 15s keeps the connection classified as active.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  try {
    const memories = await loadMemoryContext(userId, agentId, conversationId);

    const result = await runAgent({
      agent,
      userId,
      conversationId,
      userMessage: message,
      memories,
      onEvent: send,
      signal: controller.signal,
    });

    await persistTurn({
      userId,
      conversationId,
      userMessage: message,
      assistantMessage: result.content,
      toolCalls: result.toolCalls,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    await logEpisode({
      userId,
      agentId,
      summary: result.content.slice(0, 500),
      detail: {
        conversationId,
        toolsUsed: result.toolCalls.map((c) => c.toolName),
        stopReason: result.stopReason,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    if (controller.signal.aborted) {
      // Client hung up; nothing to report to.
    } else if (err instanceof MissingCredentialError) {
      send({
        type: 'error',
        message: `No ${err.provider} API key on file. Add one in settings to use this agent.`,
      });
    } else {
      console.error('[chat] run failed', err);
      send({ type: 'error', message: 'The agent run failed. Please try again.' });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
