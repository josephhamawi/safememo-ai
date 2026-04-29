/**
 * schedule_followup tool: lets the agent itself create an auto-pilot goal.
 *
 * Use cases the agent will pick this up for:
 *   - "remind me about X tomorrow at 3pm"
 *   - "follow up on this email next Monday"
 *   - "every morning at 8, summarize my unread mail"
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { computeNextRun, parseSchedule } from '../../goals/scheduleParser';
import type { MCPToolResult } from '../../types';

const db = () => admin.firestore();

export const scheduleFollowupSchema = z.object({
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(8000),
  schedule: z.string().min(1).max(60),
  userId: z.string().min(1),
  agentId: z.string().min(1),
});

export async function scheduleFollowup(
  params: z.infer<typeof scheduleFollowupSchema>,
): Promise<MCPToolResult> {
  // Validate the schedule string up-front so the agent gets immediate
  // feedback instead of seeing the goal silently park in 'error' later.
  try {
    parseSchedule(params.schedule);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{
        type: 'text',
        text: `Could not schedule follow-up: ${msg}`,
      }],
      isError: true,
    };
  }

  const now = Timestamp.now();
  let nextRunAt: Timestamp;
  try {
    const next = computeNextRun(params.schedule, new Date(), false);
    nextRunAt = next ? Timestamp.fromMillis(next.getTime()) : now;
  } catch {
    nextRunAt = now;
  }

  const ref = await db().collection('goals').add({
    ownerId: params.userId,
    agentId: params.agentId,
    title: params.title.trim(),
    prompt: params.prompt.trim(),
    schedule: params.schedule.trim(),
    status: 'active',
    nextRunAt,
    runCount: 0,
    errorCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: 'agent',
  });

  const whenText = nextRunAt.toMillis() <= Date.now() + 60_000
    ? 'within the next minute'
    : `at ${nextRunAt.toDate().toISOString()}`;

  return {
    content: [{
      type: 'text',
      text: `Scheduled follow-up "${params.title}" (id: ${ref.id}). First run ${whenText}. Schedule: ${params.schedule}.`,
    }],
  };
}
