/**
 * Auto-pilot goal runner.
 *
 * Every minute, finds active goals whose nextRunAt has passed and dispatches
 * them through the existing agent orchestrator. Each goal keeps its own
 * conversation thread so memory and context persist across runs.
 */

import '../init';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { v4 as uuidv4 } from 'uuid';
import { Timestamp } from 'firebase-admin/firestore';

import {
  Agent,
  AgentRequest,
  Goal,
  NormalizedMessage,
  SemanticMemory,
  EpisodicMemory,
  Message,
} from '../types';
import { processRequest, processRequestGemini } from '../agents/orchestrator';
import { getAvailableTools } from '../agents/mcpExecutor';
import { loadCustomMcpTools } from '../mcp/customMcp';
import { computeNextRun } from './scheduleParser';

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const openWeatherApiKey = defineSecret('OPENWEATHER_API_KEY');

const MAX_GOALS_PER_TICK = 50;
const MAX_ERROR_COUNT = 5;
const FUTURE_LOCK = 60 * 60 * 1000; // 1h placeholder while a run is in flight

const db = () => admin.firestore();

export const runDueGoals = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    secrets: [anthropicApiKey, geminiApiKey, openWeatherApiKey],
    memory: '1GiB',
    timeoutSeconds: 540,
    region: 'us-central1',
  },
  async () => {
    const now = Timestamp.now();

    const dueSnap = await db()
      .collection('goals')
      .where('status', '==', 'active')
      .where('nextRunAt', '<=', now)
      .orderBy('nextRunAt', 'asc')
      .limit(MAX_GOALS_PER_TICK)
      .get();

    if (dueSnap.empty) return;

    logger.info(`runDueGoals: ${dueSnap.size} goals due`);

    let succeeded = 0;
    let failed = 0;

    for (const goalDoc of dueSnap.docs) {
      const goalRef = goalDoc.ref;
      const goal = { id: goalDoc.id, ...goalDoc.data() } as Goal;

      // Claim the goal: optimistically push nextRunAt forward so concurrent
      // ticks won't double-fire it. If the update fails, another worker
      // already claimed it.
      const lockUntil = Timestamp.fromMillis(Date.now() + FUTURE_LOCK);
      try {
        await db().runTransaction(async (tx) => {
          const fresh = await tx.get(goalRef);
          if (!fresh.exists) throw new Error('Goal disappeared');
          const current = fresh.data() as Goal;
          if (current.status !== 'active') throw new Error('Goal no longer active');
          if (current.nextRunAt.toMillis() > now.toMillis()) {
            throw new Error('Already claimed by another run');
          }
          tx.update(goalRef, { nextRunAt: lockUntil });
        });
      } catch (claimErr) {
        logger.info('Goal claim skipped', { goalId: goal.id, reason: String(claimErr) });
        continue;
      }

      try {
        await runSingleGoal(goal);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Goal run failed', { goalId: goal.id, error: message });
        await handleGoalFailure(goal, message);
      }
    }

    logger.info(`runDueGoals complete`, { succeeded, failed, total: dueSnap.size });
  },
);

async function runSingleGoal(goal: Goal): Promise<void> {
  const runId = uuidv4();
  const conversationId = `autopilot-${goal.id}`;
  const startedAt = Timestamp.now();
  const runRef = db().collection('goals').doc(goal.id).collection('runs').doc(runId);

  await runRef.set({
    id: runId,
    goalId: goal.id,
    startedAt,
    status: 'running',
    conversationId,
  });

  // Load agent
  const agentDoc = await db().collection('agents').doc(goal.agentId).get();
  if (!agentDoc.exists) throw new Error(`Agent ${goal.agentId} not found`);
  const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent;

  if (agent.ownerId !== goal.ownerId) throw new Error('Agent ownership mismatch');
  if (agent.status !== 'active') throw new Error(`Agent is ${agent.status}`);

  // Hydrate memory (mirrors agentRouter)
  let semanticMemories: SemanticMemory[] = [];
  let episodicMemories: EpisodicMemory[] = [];
  let workingMessages: Message[] = [];

  try {
    const semanticSnap = await db()
      .collection('agents').doc(agent.id).collection('semanticMemory')
      .where('metadata.validationStatus', '==', 'approved')
      .orderBy('metadata.lastAccessed', 'desc')
      .limit(agent.memoryConfig.semanticSearchTopK)
      .get();
    semanticMemories = semanticSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as SemanticMemory,
    );
  } catch (e) { logger.warn('semantic hydration failed', e); }

  try {
    const episodicSnap = await db()
      .collection('agents').doc(agent.id).collection('episodicMemory')
      .orderBy('createdAt', 'desc')
      .limit(agent.memoryConfig.episodicSearchTopK)
      .get();
    episodicMemories = episodicSnap.docs.map(
      (d) => ({ ...d.data(), episodeId: d.data().episodeId ?? d.id }) as EpisodicMemory,
    );
  } catch (e) { logger.warn('episodic hydration failed', e); }

  try {
    const workingSnap = await db()
      .collection('agents').doc(agent.id).collection('workingMemory').doc(conversationId).get();
    workingMessages = workingSnap.exists
      ? (workingSnap.data()?.contextWindow as Message[]) ?? []
      : [];
  } catch (e) { logger.warn('working hydration failed', e); }

  const builtinTools = await getAvailableTools(agent.enabledSkills);
  const customTools = await loadCustomMcpTools(goal.ownerId);
  const tools = [...builtinTools, ...customTools];

  const normalizedMessage: NormalizedMessage = {
    id: uuidv4(),
    source: 'web',
    userId: goal.ownerId,
    agentId: agent.id,
    content: goal.prompt,
    attachments: [],
    timestamp: Timestamp.now(),
    metadata: { autopilot: true, goalId: goal.id, runId },
  };

  const agentRequest: AgentRequest = {
    message: normalizedMessage,
    agent,
    conversationId,
    idempotencyKey: runId,
  };

  const memoryContext = { semanticMemories, episodicMemories, workingMessages };

  let response;
  if (agent.model === 'gemini') {
    try {
      response = await processRequestGemini(agentRequest, memoryContext, tools);
    } catch (gemErr) {
      logger.warn('Gemini failed in autopilot, falling back to Claude', gemErr);
      response = await processRequest(agentRequest, memoryContext, tools);
    }
  } else {
    response = await processRequest(agentRequest, memoryContext, tools);
  }

  // Persist conversation/message records so users can read the run output
  const convRef = db().collection('agents').doc(agent.id).collection('conversations').doc(conversationId);
  const batch = db().batch();
  batch.set(
    convRef,
    {
      id: conversationId,
      agentId: agent.id,
      userId: goal.ownerId,
      title: `[Auto-pilot] ${goal.title}`,
      source: 'web',
      messageCount: admin.firestore.FieldValue.increment(2),
      updatedAt: Timestamp.now(),
      autopilotGoalId: goal.id,
    },
    { merge: true },
  );
  // User-side prompt record so the conversation reads naturally
  batch.set(convRef.collection('messages').doc(uuidv4()), {
    role: 'user',
    content: goal.prompt,
    timestamp: Timestamp.now(),
    metadata: { autopilot: true, goalId: goal.id, runId },
  });
  batch.set(convRef.collection('messages').doc(response.messageId), {
    id: response.messageId,
    role: 'assistant',
    content: response.content,
    timestamp: Timestamp.now(),
    toolCalls: response.toolCalls,
    tokenUsage: response.tokenUsage,
  });
  await batch.commit();

  const finishedAt = Timestamp.now();
  const summary = response.content.slice(0, 280);

  await runRef.update({
    finishedAt,
    status: 'success',
    messageId: response.messageId,
    responseSummary: summary,
    toolCallCount: response.toolCalls.length,
  });

  // Compute next run and update goal
  const nextRun = computeNextRun(goal.schedule, new Date(finishedAt.toMillis()), true, goal.timezone);
  const goalRef = db().collection('goals').doc(goal.id);
  if (nextRun === null) {
    await goalRef.update({
      status: 'completed',
      lastRunAt: finishedAt,
      lastResult: { summary, runId, finishedAt },
      runCount: admin.firestore.FieldValue.increment(1),
      updatedAt: finishedAt,
    });
  } else {
    await goalRef.update({
      lastRunAt: finishedAt,
      nextRunAt: Timestamp.fromMillis(nextRun.getTime()),
      lastResult: { summary, runId, finishedAt },
      runCount: admin.firestore.FieldValue.increment(1),
      errorCount: 0,
      updatedAt: finishedAt,
    });
  }
}

async function handleGoalFailure(goal: Goal, errorMessage: string): Promise<void> {
  const goalRef = db().collection('goals').doc(goal.id);
  const finishedAt = Timestamp.now();
  const newErrorCount = (goal.errorCount ?? 0) + 1;

  // Find or create a run record for this failure
  const runId = uuidv4();
  await goalRef.collection('runs').doc(runId).set({
    id: runId,
    goalId: goal.id,
    startedAt: finishedAt,
    finishedAt,
    status: 'error',
    error: errorMessage,
  });

  // If under threshold: schedule next attempt; otherwise mark error
  let updates: Record<string, unknown> = {
    lastRunAt: finishedAt,
    lastResult: { summary: '', error: errorMessage, runId, finishedAt },
    errorCount: newErrorCount,
    updatedAt: finishedAt,
  };

  if (newErrorCount >= MAX_ERROR_COUNT) {
    updates.status = 'error';
  } else {
    try {
      const nextRun = computeNextRun(goal.schedule, new Date(finishedAt.toMillis()), true, goal.timezone);
      if (nextRun === null) {
        updates.status = 'completed';
      } else {
        updates.nextRunAt = Timestamp.fromMillis(nextRun.getTime());
      }
    } catch (parseErr) {
      // Bad schedule string — park the goal in error
      updates.status = 'error';
      updates.lastResult = {
        summary: '',
        error: `Schedule parse failed: ${String(parseErr)}`,
        runId,
        finishedAt,
      };
    }
  }

  await goalRef.update(updates);
}
