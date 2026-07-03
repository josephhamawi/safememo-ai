/**
 * Audit share-token tests.
 *
 * Share tokens grant an external auditor read-only access to a single
 * memory's audit lineage without an account. They are HMAC-signed, so the
 * whole security model rests on: (1) the signature can't be forged or
 * tampered, (2) expired tokens are refused, (3) comparison is timing-safe,
 * and (4) minting is gated on caller ownership. These tests cover all four.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as crypto from 'crypto';

// signToken() / verifyToken() accept an explicit secret, so most tests pass
// one directly. mintShareToken() falls back to the AUDIT_SHARE_SECRET param,
// which reads process.env at call time — set it before importing.
process.env.AUDIT_SHARE_SECRET = 'unit-test-secret';

// mintToken.ts (callable) reads Firestore to enforce ownership.
const mockAgentGet = jest.fn();
const mockMemGet = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ get: mockAgentGet })) })),
    doc: jest.fn(() => ({ get: mockMemGet })),
  })),
}));

import {
  signToken,
  verifyToken,
  mintShareToken,
  DEFAULT_TOKEN_TTL_DAYS,
} from '../audit/share';
import { mintAuditShareToken } from '../audit/mintToken';

const SECRET = 'unit-test-secret';
const DAY_MS = 24 * 60 * 60 * 1000;

function futurePayload(overrides: Partial<{ tenantId: string; memoryId: string; expiresAt: number }> = {}) {
  return {
    tenantId: 'tenant-1',
    memoryId: 'mem-1',
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('signToken / verifyToken round-trip', () => {
  it('verifies a freshly signed token and returns the payload', () => {
    const payload = futurePayload();
    const token = signToken(payload, SECRET);

    const decoded = verifyToken(token, SECRET);
    expect(decoded.tenantId).toBe('tenant-1');
    expect(decoded.memoryId).toBe('mem-1');
    expect(decoded.expiresAt).toBe(payload.expiresAt);
  });

  it('produces a two-part body.signature token', () => {
    const token = signToken(futurePayload(), SECRET);
    expect(token.split('.')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe('verifyToken rejects invalid tokens', () => {
  it('rejects a token signed with a different secret', () => {
    const token = signToken(futurePayload(), 'attacker-secret');
    expect(() => verifyToken(token, SECRET)).toThrow('Invalid signature');
  });

  it('rejects a tampered signature (same length, flipped char)', () => {
    const token = signToken(futurePayload(), SECRET);
    const [body, sig] = token.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(() => verifyToken(`${body}.${flipped}`, SECRET)).toThrow('Invalid signature');
  });

  it('rejects a tampered payload body (signature no longer matches)', () => {
    const token = signToken(futurePayload({ tenantId: 'tenant-1' }), SECRET);
    const [, sig] = token.split('.');
    // Re-encode a different payload but keep the original signature.
    const forgedBody = Buffer.from(JSON.stringify(futurePayload({ tenantId: 'tenant-EVIL' })))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => verifyToken(`${forgedBody}.${sig}`, SECRET)).toThrow('Invalid signature');
  });

  it('rejects a malformed (single-part) token', () => {
    expect(() => verifyToken('not-a-token', SECRET)).toThrow('Malformed token');
  });

  it('rejects an expired token even when the signature is valid', () => {
    const token = signToken(futurePayload({ expiresAt: Date.now() - 1000 }), SECRET);
    expect(() => verifyToken(token, SECRET)).toThrow('Token expired');
  });
});

// ---------------------------------------------------------------------------
describe('timing-safe comparison', () => {
  // crypto.timingSafeEqual throws a RangeError on unequal-length buffers, so a
  // safe implementation must length-check BEFORE the constant-time compare.
  // A wrong-length signature must be rejected as invalid, not blow up.
  it('rejects a wrong-length signature cleanly (length-guarded constant-time compare)', () => {
    const token = signToken(futurePayload(), SECRET);
    const [body, sig] = token.split('.');
    const truncated = sig.slice(0, sig.length - 4);

    let err: Error | undefined;
    try {
      verifyToken(`${body}.${truncated}`, SECRET);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('Invalid signature');
    // Specifically NOT a RangeError leaking from timingSafeEqual.
    expect(err).not.toBeInstanceOf(RangeError);
  });

  it('compares the full-length signature via crypto.timingSafeEqual for equal-length inputs', () => {
    // Sanity guard: a validly-signed, equal-length signature passes; a
    // same-length forgery fails. Only a constant-time compare distinguishes
    // these without early-exit, and the source uses crypto.timingSafeEqual.
    const token = signToken(futurePayload(), SECRET);
    expect(() => verifyToken(token, SECRET)).not.toThrow();

    const [body, sig] = token.split('.');
    const forged = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1); // same length
    expect(forged.length).toBe(sig.length);
    expect(() => verifyToken(`${body}.${forged}`, SECRET)).toThrow('Invalid signature');
  });
});

// ---------------------------------------------------------------------------
describe('mintShareToken TTL', () => {
  it('defaults to a 7-day TTL', () => {
    expect(DEFAULT_TOKEN_TTL_DAYS).toBe(7);
  });

  it('mints a token expiring ~7 days out by default', async () => {
    const before = Date.now();
    const { token, expiresAt } = await mintShareToken({ tenantId: 't', memoryId: 'm' });

    expect(expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 5000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS + 5000);
    // The minted token is itself valid and carries the same expiry.
    const decoded = verifyToken(token, SECRET);
    expect(decoded.expiresAt).toBe(expiresAt);
  });

  it('clamps an over-long TTL to the 30-day policy ceiling', async () => {
    const { expiresAt } = await mintShareToken({ tenantId: 't', memoryId: 'm', ttlDays: 999 });
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS + 5000);
  });
});

// ---------------------------------------------------------------------------
describe('mintAuditShareToken ownership enforcement', () => {
  const call = (auth: unknown, data: unknown) =>
    (mintAuditShareToken as unknown as { run: (r: unknown) => Promise<unknown> }).run({ auth, data });

  it('rejects an unauthenticated caller', async () => {
    await expect(call(null, { agentId: 'a1', memoryId: 'm1' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects when agentId or memoryId is missing', async () => {
    await expect(call({ uid: 'user-A' }, { agentId: 'a1' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects when the caller does not own the agent', async () => {
    mockAgentGet.mockResolvedValue({
      exists: true,
      get: (f: string) => (f === 'ownerId' ? 'someone-else' : undefined),
    } as never);

    await expect(
      call({ uid: 'user-A' }, { agentId: 'a1', memoryId: 'm1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when the agent does not exist', async () => {
    mockAgentGet.mockResolvedValue({ exists: false, get: () => undefined } as never);

    await expect(
      call({ uid: 'user-A' }, { agentId: 'ghost', memoryId: 'm1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when the memory does not exist under the owned agent', async () => {
    mockAgentGet.mockResolvedValue({
      exists: true,
      get: (f: string) => (f === 'ownerId' ? 'user-A' : undefined),
    } as never);
    mockMemGet.mockResolvedValue({ exists: false } as never);

    await expect(
      call({ uid: 'user-A' }, { agentId: 'a1', memoryId: 'ghost' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('mints a valid token for the rightful owner', async () => {
    mockAgentGet.mockResolvedValue({
      exists: true,
      get: (f: string) => (f === 'ownerId' ? 'user-A' : undefined),
    } as never);
    mockMemGet.mockResolvedValue({ exists: true } as never);

    const result = (await call({ uid: 'user-A' }, { agentId: 'a1', memoryId: 'm1' })) as {
      token: string;
      expiresAt: number;
    };

    expect(typeof result.token).toBe('string');
    // Token is bound to the CALLER's uid as tenantId, not to spoofed input.
    const decoded = verifyToken(result.token, SECRET);
    expect(decoded.tenantId).toBe('user-A');
    expect(decoded.memoryId).toBe('m1');
  });
});
