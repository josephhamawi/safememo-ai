/**
 * Budget guard tests.
 *
 * Per-tenant daily cost cap. This is a fail-closed control: if a tenant is
 * at or over their cap, the next metered request must be blocked even if its
 * own cost would be negligible. These tests verify:
 *
 *   - assertWithinBudget passes below the cap
 *   - assertWithinBudget throws BudgetExceededError AT and OVER the cap
 *   - per-tenant dailyCapOverrideUSD is honored (via resolveCap)
 *   - the 80% soft-warning path warns but still proceeds
 *   - recordUsage increments totalUSD atomically
 *
 * Firestore reads/writes are mocked; resolveCap is exercised through
 * assertWithinBudget since it is module-private.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- mocks -----------------------------------------------------------------

// Per-test document stores, keyed by full Firestore path.
let mockUsageDocs: Record<string, Record<string, unknown> | undefined> = {};
let mockTenantDocs: Record<string, Record<string, unknown> | undefined> = {};

const mockSet = jest.fn(async () => undefined);

const mockDoc = jest.fn((path: string) => ({
  get: jest.fn(async () => {
    const isUsage = path.includes('/usage/');
    const data = isUsage ? mockUsageDocs[path] : mockTenantDocs[path];
    return {
      exists: data !== undefined,
      get: (field: string) => (data ? data[field] : undefined),
    };
  }),
  set: mockSet,
}));

const mockWarn = jest.fn();
const mockError = jest.fn();
const mockInfo = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({ doc: mockDoc })),
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  },
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { warn: mockWarn, error: mockError, info: mockInfo },
}));

import {
  assertWithinBudget,
  recordUsage,
  getDailySpend,
  BudgetExceededError,
  MAX_DAILY_COST_USD,
} from '../cost/budgetGuard';

// --- helpers ---------------------------------------------------------------

const DATE = new Date().toISOString().slice(0, 10);
const usagePath = (tenant: string) => `users/${tenant}/usage/${DATE}`;
const tenantPath = (tenant: string) => `users/${tenant}`;

beforeEach(() => {
  jest.clearAllMocks();
  mockUsageDocs = {};
  mockTenantDocs = {};
});

// ---------------------------------------------------------------------------
describe('assertWithinBudget', () => {
  it('passes when spend is below the cap', async () => {
    mockUsageDocs[usagePath('t-under')] = { totalUSD: 1.0 };

    const status = await assertWithinBudget('t-under');

    expect(status.withinBudget).toBe(true);
    expect(status.spentUSD).toBe(1.0);
    expect(status.capUSD).toBe(MAX_DAILY_COST_USD);
    expect(status.remainingUSD).toBeCloseTo(4.0);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('passes when there is no usage doc yet (spend defaults to 0)', async () => {
    const status = await assertWithinBudget('t-fresh');
    expect(status.withinBudget).toBe(true);
    expect(status.spentUSD).toBe(0);
  });

  it('throws BudgetExceededError AT the cap (fail-closed)', async () => {
    mockUsageDocs[usagePath('t-at')] = { totalUSD: MAX_DAILY_COST_USD };

    await expect(assertWithinBudget('t-at')).rejects.toThrow(BudgetExceededError);
  });

  it('throws BudgetExceededError OVER the cap and carries spent/cap', async () => {
    mockUsageDocs[usagePath('t-over')] = { totalUSD: 6.5 };

    let caught: BudgetExceededError | undefined;
    try {
      await assertWithinBudget('t-over');
    } catch (err) {
      caught = err as BudgetExceededError;
    }

    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect(caught?.spent).toBe(6.5);
    expect(caught?.cap).toBe(MAX_DAILY_COST_USD);
    expect(caught?.tenantId).toBe('t-over');
  });

  it('honors a per-tenant dailyCapOverrideUSD via resolveCap', async () => {
    // Spend of 6.0 would EXCEED the default $5 cap, but this tenant has a
    // raised cap of $10, so it must pass.
    mockTenantDocs[tenantPath('t-vip')] = { dailyCapOverrideUSD: 10 };
    mockUsageDocs[usagePath('t-vip')] = { totalUSD: 6.0 };

    const status = await assertWithinBudget('t-vip');

    expect(status.withinBudget).toBe(true);
    expect(status.capUSD).toBe(10);
    expect(status.remainingUSD).toBeCloseTo(4.0);
  });

  it('proves the override is load-bearing: same spend throws under the default cap', async () => {
    // Identical 6.0 spend, no override => must throw.
    mockUsageDocs[usagePath('t-default')] = { totalUSD: 6.0 };
    await expect(assertWithinBudget('t-default')).rejects.toThrow(BudgetExceededError);
  });

  it('ignores an invalid (non-positive) override and uses the default cap', async () => {
    mockTenantDocs[tenantPath('t-bad')] = { dailyCapOverrideUSD: 0 };
    mockUsageDocs[usagePath('t-bad')] = { totalUSD: 1.0 };

    const status = await assertWithinBudget('t-bad');
    expect(status.capUSD).toBe(MAX_DAILY_COST_USD);
  });

  it('warns but still proceeds at the 80% soft threshold', async () => {
    // 80% of the $5 default cap.
    mockUsageDocs[usagePath('t-warn')] = { totalUSD: 4.0 };

    const status = await assertWithinBudget('t-warn');

    expect(status.withinBudget).toBe(true);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [, meta] = mockWarn.mock.calls[0] as [string, { utilization: number }];
    expect(meta.utilization).toBeCloseTo(0.8);
  });
});

// ---------------------------------------------------------------------------
describe('getDailySpend', () => {
  it('reads totalUSD from the usage doc', async () => {
    mockUsageDocs[usagePath('t-read')] = { totalUSD: 2.75 };
    expect(await getDailySpend('t-read')).toBe(2.75);
  });

  it('returns 0 when the usage doc is absent', async () => {
    expect(await getDailySpend('t-none')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('recordUsage', () => {
  it('increments totalUSD with the computed Claude cost', async () => {
    await recordUsage({
      tenantId: 't-rec',
      kind: 'claude',
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [payload, options] = mockSet.mock.calls[0] as unknown as [
      Record<string, { __increment: number }>,
      { merge: boolean },
    ];

    // 1000 * 3/1e6 (input) + 500 * 15/1e6 (output) = 0.003 + 0.0075 = 0.0105
    expect(payload.totalUSD.__increment).toBeCloseTo(0.0105);
    expect(payload.claudeInputTokens.__increment).toBe(1000);
    expect(payload.claudeOutputTokens.__increment).toBe(500);
    expect(options).toEqual({ merge: true });
  });

  it('counts memoryWrite operations without adding cost', async () => {
    await recordUsage({ tenantId: 't-mw', kind: 'memoryWrite' });

    const [payload] = mockSet.mock.calls[0] as unknown as [Record<string, { __increment: number }>];
    expect(payload.totalUSD.__increment).toBe(0);
    expect(payload.memoryWrites.__increment).toBe(1);
  });

  it('is best-effort: a Firestore write failure does not throw', async () => {
    mockSet.mockRejectedValueOnce(new Error('firestore down') as never);
    await expect(
      recordUsage({ tenantId: 't-fail', kind: 'embedding', inputChars: 2000 }),
    ).resolves.toBeUndefined();
    expect(mockError).toHaveBeenCalled();
  });
});
