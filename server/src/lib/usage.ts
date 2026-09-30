/**
 * Per-user daily usage counters.
 *
 * Under BYOK the user is billed by their provider directly, so this is not a
 * spend cap — it is a resource guard for this server. The Firebase-era
 * `budgetGuard` tracked USD against a $5/day ceiling; that concept does not
 * survive the move to bring-your-own-key and is deliberately not ported.
 */

import { query, queryOne } from '../db';
import { env } from '../env';

export interface UsageDelta {
  inputTokens?: number;
  outputTokens?: number;
  embedChars?: number;
}

export async function recordUsage(
  userId: string,
  delta: UsageDelta,
): Promise<void> {
  await query(
    `INSERT INTO usage_daily
       (user_id, day, input_tokens, output_tokens, embed_chars, requests)
     VALUES ($1, current_date, $2, $3, $4, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET
       input_tokens  = usage_daily.input_tokens  + EXCLUDED.input_tokens,
       output_tokens = usage_daily.output_tokens + EXCLUDED.output_tokens,
       embed_chars   = usage_daily.embed_chars   + EXCLUDED.embed_chars,
       requests      = usage_daily.requests      + 1`,
    [
      userId,
      delta.inputTokens ?? 0,
      delta.outputTokens ?? 0,
      delta.embedChars ?? 0,
    ],
  );
}

export interface UsageToday {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  limit: number;
  remaining: number;
}

export async function usageToday(userId: string): Promise<UsageToday> {
  const row = await queryOne<{
    requests: string;
    input_tokens: string;
    output_tokens: string;
  }>(
    `SELECT requests::text, input_tokens::text, output_tokens::text
       FROM usage_daily WHERE user_id = $1 AND day = current_date`,
    [userId],
  );

  const requests = Number(row?.requests ?? 0);

  return {
    requests,
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    limit: env.DAILY_REQUEST_LIMIT,
    remaining: Math.max(0, env.DAILY_REQUEST_LIMIT - requests),
  };
}

export class DailyLimitExceededError extends Error {
  constructor(readonly limit: number) {
    super(`Daily request limit of ${limit} reached`);
    this.name = 'DailyLimitExceededError';
  }
}

/** Throws if the user is out of requests for today. Call before a model run. */
export async function assertWithinDailyLimit(userId: string): Promise<void> {
  const usage = await usageToday(userId);
  if (usage.remaining <= 0) {
    throw new DailyLimitExceededError(usage.limit);
  }
}
