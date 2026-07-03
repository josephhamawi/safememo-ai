/**
 * Sign-up allowlist gate tests.
 *
 * Invite-only enforcement at the Identity Platform layer. This is a
 * fail-closed control: only explicitly allowlisted emails may create an
 * account, across every auth provider. These tests exercise `isAllowed`
 * (the decision the blocking function makes) against a mocked Firestore:
 *
 *   - bootstrap list allows without any Firestore lookup
 *   - per-person allowlist/{email} doc allows; enabled:false blocks
 *   - allowlistDomains/{domain} doc allows a whole firm; enabled:false blocks
 *   - unknown emails are blocked
 *   - matching is case/whitespace insensitive
 *   - a Firestore error propagates (the handler turns it into fail-closed)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- mocks -----------------------------------------------------------------

// Per-test document store keyed by full Firestore path. `undefined` => missing.
let mockDocs: Record<string, Record<string, unknown> | undefined> = {};
let mockGetError: Error | null = null;

const mockDoc = jest.fn((path: string) => ({
  get: jest.fn(async () => {
    if (mockGetError) throw mockGetError;
    const data = mockDocs[path];
    return {
      exists: data !== undefined,
      data: () => data,
    };
  }),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({ doc: mockDoc })),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// beforeUserCreated just returns its handler so importing the module needs no
// Identity Platform runtime.
jest.mock('firebase-functions/v2/identity', () => ({
  beforeUserCreated: (_opts: unknown, handler: unknown) => handler,
}));

jest.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

// defineString('SIGNUP_ALLOWLIST_BOOTSTRAP').value() reads the env var so a
// test can vary the bootstrap list.
jest.mock('firebase-functions/params', () => ({
  defineString: (name: string, opts?: { default?: string }) => ({
    value: () => process.env[name] ?? opts?.default ?? '',
  }),
}));

import { isAllowed, normalizeEmail } from '../auth/signupGate';

beforeEach(() => {
  mockDocs = {};
  mockGetError = null;
  delete process.env.SIGNUP_ALLOWLIST_BOOTSTRAP;
  jest.clearAllMocks();
});

// --- tests -----------------------------------------------------------------

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Founder@Firm.COM ')).toBe('founder@firm.com');
  });
});

describe('isAllowed — bootstrap list', () => {
  it('allows a bootstrap email without touching Firestore', async () => {
    process.env.SIGNUP_ALLOWLIST_BOOTSTRAP = 'founder@firm.com, ops@firm.com';
    await expect(isAllowed('Founder@Firm.com')).resolves.toBe(true);
    expect(mockDoc).not.toHaveBeenCalled();
  });

  it('does not allow a non-bootstrap email via the bootstrap path', async () => {
    process.env.SIGNUP_ALLOWLIST_BOOTSTRAP = 'founder@firm.com';
    await expect(isAllowed('stranger@evil.com')).resolves.toBe(false);
  });
});

describe('isAllowed — per-person allowlist', () => {
  it('allows an allowlisted email', async () => {
    mockDocs['allowlist/lawyer@partner.com'] = { email: 'lawyer@partner.com' };
    await expect(isAllowed('Lawyer@Partner.com')).resolves.toBe(true);
  });

  it('blocks an allowlist entry explicitly disabled', async () => {
    mockDocs['allowlist/revoked@partner.com'] = { enabled: false };
    await expect(isAllowed('revoked@partner.com')).resolves.toBe(false);
  });
});

describe('isAllowed — domain allowlist', () => {
  it('allows any email at an allowlisted domain', async () => {
    mockDocs['allowlistDomains/partner.com'] = { domain: 'partner.com' };
    await expect(isAllowed('anyone@partner.com')).resolves.toBe(true);
  });

  it('blocks a disabled domain', async () => {
    mockDocs['allowlistDomains/partner.com'] = { enabled: false };
    await expect(isAllowed('anyone@partner.com')).resolves.toBe(false);
  });
});

describe('isAllowed — no match', () => {
  it('blocks an unknown email', async () => {
    await expect(isAllowed('stranger@nowhere.com')).resolves.toBe(false);
  });

  it('blocks an empty email', async () => {
    await expect(isAllowed('   ')).resolves.toBe(false);
  });
});

describe('isAllowed — fail-closed', () => {
  it('propagates a Firestore error (handler treats it as blocked)', async () => {
    mockGetError = new Error('firestore unavailable');
    await expect(isAllowed('someone@partner.com')).rejects.toThrow(
      'firestore unavailable',
    );
  });
});
