/**
 * Per-tenant daily cost guardrails.
 *
 * Tracks LLM, embedding, and memory-write spend in
 * `users/{tenantId}/usage/{YYYY-MM-DD}` and throws BudgetExceededError
 * once spend approaches MAX_DAILY_COST_USD.
 *
 * The cap exists to bound runaway cost on Firebase Blaze. To raise
 * it for a single tenant, set the `dailyCapOverrideUSD` field on
 * `users/{tenantId}` (admin-only write).
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Hard cap on per-tenant per-day spend across all metered operations. */
export const MAX_DAILY_COST_USD = 5.0;

/** Soft warning threshold (80% of cap). Operations still proceed but log a warning. */
const WARN_THRESHOLD = 0.8;

/** Maximum input characters fed to the embedding model in a single call.
 *  Vertex textembedding-gecko handles up to 3072 tokens; cap conservatively. */
export const MAX_EMBEDDING_INPUT_CHARS = 8000;

/** Maximum output tokens for any LLM completion. Per-agent maxTokens still applies as a lower bound. */
export const MAX_LLM_OUTPUT_TOKENS = 4096;

// Pricing constants (USD per token / per request) — keep in one place.
// Sourced from public list pricing as of 2026-05; may drift, treat as ceiling.
const PRICING = {
  // Anthropic Claude Sonnet 4.6
  claudeInputPerToken: 3.0 / 1_000_000,
  claudeOutputPerToken: 15.0 / 1_000_000,
  // Google Gemini 2.5 Flash
  geminiInputPerToken: 0.10 / 1_000_000,
  geminiOutputPerToken: 0.40 / 1_000_000,
  // Vertex AI textembedding-gecko (per 1k chars input)
  embeddingPerKChars: 0.0001,
  // Memory write — pure Firestore. Not metered against $ cap, but counted.
  memoryWriteUSD: 0,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BudgetExceededError extends Error {
  constructor(
    public tenantId: string,
    public spent: number,
    public cap: number,
  ) {
    super(
      `Daily budget exceeded for tenant ${tenantId}: ` +
        `$${spent.toFixed(4)} / $${cap.toFixed(2)}`,
    );
    this.name = 'BudgetExceededError';
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD in UTC. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function usageDocPath(tenantId: string, dateUTC: string): string {
  return `users/${tenantId}/usage/${dateUTC}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostKind = 'claude' | 'gemini' | 'embedding' | 'memoryWrite';

interface UsageDoc {
  tenantId: string;
  date: string;
  totalUSD: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
  embeddingChars: number;
  memoryWrites: number;
  lastUpdatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface BudgetStatus {
  spentUSD: number;
  capUSD: number;
  remainingUSD: number;
  withinBudget: boolean;
}

// ---------------------------------------------------------------------------
// Caching (in-memory, per cold start)
// ---------------------------------------------------------------------------

const _cache = new Map<string, { value: number; expires: number }>();
const CACHE_TTL_MS = 5_000;

function cacheGet(key: string): number | null {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    _cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: number): void {
  _cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the effective daily cap for a tenant.
 * Reads `dailyCapOverrideUSD` from the tenant doc; falls back to MAX_DAILY_COST_USD.
 */
async function resolveCap(tenantId: string): Promise<number> {
  try {
    const snap = await getFirestore().doc(`users/${tenantId}`).get();
    const override = snap.get('dailyCapOverrideUSD');
    if (typeof override === 'number' && override > 0) return override;
  } catch (err) {
    logger.warn('Failed to read tenant cap override, using default', {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return MAX_DAILY_COST_USD;
}

/**
 * Read today's spend for the tenant. Returns 0 if the doc does not exist.
 */
export async function getDailySpend(tenantId: string): Promise<number> {
  const date = todayUTC();
  const cacheKey = `${tenantId}:${date}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const snap = await getFirestore().doc(usageDocPath(tenantId, date)).get();
  const total = snap.exists ? Number(snap.get('totalUSD')) || 0 : 0;
  cacheSet(cacheKey, total);
  return total;
}

/**
 * Check whether the tenant has budget left. Throws BudgetExceededError if not.
 *
 * Call this BEFORE making an expensive request. The check is a soft prediction:
 * if the most recent recorded spend is already at the cap, the next request
 * is blocked even if its individual cost would be tiny — fail-closed by design.
 */
export async function assertWithinBudget(tenantId: string): Promise<BudgetStatus> {
  const [spent, cap] = await Promise.all([
    getDailySpend(tenantId),
    resolveCap(tenantId),
  ]);

  const status: BudgetStatus = {
    spentUSD: spent,
    capUSD: cap,
    remainingUSD: Math.max(0, cap - spent),
    withinBudget: spent < cap,
  };

  if (!status.withinBudget) {
    throw new BudgetExceededError(tenantId, spent, cap);
  }

  if (spent / cap >= WARN_THRESHOLD) {
    logger.warn('Tenant approaching daily budget cap', {
      tenantId,
      spentUSD: spent,
      capUSD: cap,
      utilization: spent / cap,
    });
  }

  return status;
}

// ---------------------------------------------------------------------------
// Cost computation
// ---------------------------------------------------------------------------

interface UsageInput {
  tenantId: string;
  kind: CostKind;
  // For LLMs:
  inputTokens?: number;
  outputTokens?: number;
  // For embeddings:
  inputChars?: number;
  // For memoryWrite, no extra fields — count only.
}

function computeUSD(input: UsageInput): number {
  switch (input.kind) {
    case 'claude':
      return (
        (input.inputTokens ?? 0) * PRICING.claudeInputPerToken +
        (input.outputTokens ?? 0) * PRICING.claudeOutputPerToken
      );
    case 'gemini':
      return (
        (input.inputTokens ?? 0) * PRICING.geminiInputPerToken +
        (input.outputTokens ?? 0) * PRICING.geminiOutputPerToken
      );
    case 'embedding':
      return ((input.inputChars ?? 0) / 1000) * PRICING.embeddingPerKChars;
    case 'memoryWrite':
      return PRICING.memoryWriteUSD;
  }
}

/**
 * Record actual usage after a request completes. Idempotent at the
 * per-call level (uses Firestore atomic increments).
 *
 * Best-effort: failures are logged but never thrown. We prefer to lose
 * a usage entry than to fail user-facing requests on a metering error.
 */
export async function recordUsage(input: UsageInput): Promise<void> {
  const usd = computeUSD(input);
  if (usd < 0) return;

  const date = todayUTC();
  const path = usageDocPath(input.tenantId, date);

  try {
    const update: Record<string, unknown> = {
      tenantId: input.tenantId,
      date,
      totalUSD: FieldValue.increment(usd),
      lastUpdatedAt: FieldValue.serverTimestamp(),
    };

    if (input.kind === 'claude') {
      update.claudeInputTokens = FieldValue.increment(input.inputTokens ?? 0);
      update.claudeOutputTokens = FieldValue.increment(input.outputTokens ?? 0);
    } else if (input.kind === 'gemini') {
      update.geminiInputTokens = FieldValue.increment(input.inputTokens ?? 0);
      update.geminiOutputTokens = FieldValue.increment(input.outputTokens ?? 0);
    } else if (input.kind === 'embedding') {
      update.embeddingChars = FieldValue.increment(input.inputChars ?? 0);
    } else if (input.kind === 'memoryWrite') {
      update.memoryWrites = FieldValue.increment(1);
    }

    await getFirestore().doc(path).set(update, { merge: true });

    // Bust the cache so the next assertWithinBudget sees the increment.
    _cache.delete(`${input.tenantId}:${date}`);
  } catch (err) {
    logger.error('Failed to record usage (will not block request)', {
      tenantId: input.tenantId,
      kind: input.kind,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Convenience wrapper: ensure budget, run the operation, record usage.
 *
 * Prefer the granular API when you need to compute usage from a streaming
 * response (e.g. orchestrator token-by-token streaming).
 */
export async function withBudget<T>(
  tenantId: string,
  estimatedKind: CostKind,
  estimatedUnits: { inputTokens?: number; outputTokens?: number; inputChars?: number },
  fn: () => Promise<T>,
): Promise<T> {
  await assertWithinBudget(tenantId);
  const result = await fn();
  await recordUsage({ tenantId, kind: estimatedKind, ...estimatedUnits });
  return result;
}
