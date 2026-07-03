/**
 * Validation Gate tests.
 *
 * The validation gate is the memory write-path guard: every proposed memory
 * is screened for near-duplicates and contradictions before it can be
 * promoted to the approved semantic store. For a compliance product this is
 * the differentiator, so these tests exercise the real logic:
 *
 *   - cosineSimilarity math (the similarity primitive everything rests on)
 *   - checkDuplicates (>= 0.92 => duplicate) via the public processStaging
 *   - checkContradictions (0.7-0.91 band + shared tags => flagged with a
 *     plain-English explanation for the human reviewer)
 *   - clean, clearly-different memories pass with no flags
 *
 * checkDuplicates / checkContradictions are module-private, so they are
 * driven through the exported processStaging(), which returns both results.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { StagingMemory, SemanticMemory } from '../types';

// --- firebase-admin mocks (mirrors memoryManager.test.ts conventions) ------

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
}));

// Approved memories returned by the semanticMemory collection query.
// Reassigned per-test; the query mock reads it lazily on each call.
let mockSemanticDocs: Array<{ data: () => SemanticMemory }> = [];

const mockUpdate = jest.fn(async () => undefined);
const mockTxGet = jest.fn();
const mockTxSet = jest.fn();
const mockTxDelete = jest.fn();

const mockQueryGet = jest.fn(async () => ({ docs: mockSemanticDocs }));
const mockLimit = jest.fn(() => ({ get: mockQueryGet }));
const mockDocRef = { update: mockUpdate, id: 'ref-id' };
const mockDoc = jest.fn(() => mockDocRef);
const mockCollection = jest.fn(() => ({
  limit: mockLimit,
  get: mockQueryGet,
  doc: mockDoc,
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
    doc: mockDoc,
    runTransaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ get: mockTxGet, set: mockTxSet, delete: mockTxDelete }),
    ),
  })),
  Timestamp: {
    now: () => ({ toDate: () => new Date(), seconds: 0 }),
    fromDate: (d: Date) => ({ toDate: () => d, seconds: 0 }),
  },
  FieldValue: {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
    delete: jest.fn(() => 'DELETE_FIELD'),
  },
}));

// Import AFTER mocks are registered.
import { cosineSimilarity, processStaging } from '../memory/validationGate';

// --- fixtures --------------------------------------------------------------

const TS = { toDate: () => new Date(), seconds: 0 } as never;

function makeStaging(overrides: Partial<StagingMemory> = {}): StagingMemory {
  return {
    id: 'staging-1',
    agentId: 'agent-1',
    content: 'The monthly retainer is $5000',
    embedding: [1, 0, 0],
    metadata: {
      source: 'conversation',
      confidence: 0.5, // low so a clean memory is NOT auto-approved
      validationStatus: 'staging',
      tags: ['billing'],
      createdAt: TS,
      lastAccessed: TS,
      accessCount: 0,
    },
    accessControl: { ownerId: 'user-1', visibility: 'private', allowedUsers: [] },
    proposedBy: 'agent',
    explanation: 'extracted from conversation',
    autoApprovalEligible: false,
    ...overrides,
  } as StagingMemory;
}

function makeSemantic(overrides: Partial<SemanticMemory> = {}): SemanticMemory {
  return {
    id: 'sem-1',
    agentId: 'agent-1',
    content: 'The retainer is $8000',
    embedding: [1, 0, 0],
    metadata: {
      source: 'conversation',
      confidence: 0.9,
      validationStatus: 'approved',
      tags: ['billing'],
      createdAt: TS,
      lastAccessed: TS,
      accessCount: 0,
    },
    accessControl: { ownerId: 'user-1', visibility: 'private', allowedUsers: [] },
    ...overrides,
  } as SemanticMemory;
}

function approvedDocs(mems: SemanticMemory[]) {
  return mems.map((m) => ({ data: () => m }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSemanticDocs = [];
});

// ---------------------------------------------------------------------------
describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns 1 for parallel (scaled) vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1);
  });

  it('returns 0 for mismatched lengths (no crash)', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 when a vector is all zeros (undefined direction)', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('processStaging - duplicate detection', () => {
  it('flags a near-identical memory at/above the 0.92 threshold', async () => {
    // Identical embedding => cosine similarity 1.0 (well above 0.92).
    mockSemanticDocs = approvedDocs([makeSemantic({ id: 'sem-dup', embedding: [1, 0, 0] })]);

    // A duplicate gets auto-rejected, which runs a transaction; make the
    // staging doc "exist" for that path.
    const staging = makeStaging({ embedding: [1, 0, 0] });
    mockTxGet.mockResolvedValue({ exists: true, data: () => staging } as never);

    const result = await processStaging('agent-1', staging);

    expect(result.duplicateResult.hasDuplicate).toBe(true);
    expect(result.duplicateResult.similarMemoryId).toBe('sem-dup');
    expect(result.duplicateResult.similarityScore).toBeCloseTo(1);
    // A duplicate must never be auto-approved into the semantic store.
    expect(result.autoApproved).toBe(false);
  });

  it('does NOT flag a duplicate just below the 0.92 threshold', async () => {
    // [1,0] vs [1,1] => cos ~0.707, which is a contradiction candidate but
    // NOT a duplicate. Use a NON-overlapping tag so contradiction stays off
    // and we isolate the duplicate boundary.
    mockSemanticDocs = approvedDocs([
      makeSemantic({ id: 'sem-near', embedding: [1, 1], metadata: {
        source: 'conversation', confidence: 0.9, validationStatus: 'approved',
        tags: ['unrelated'], createdAt: TS, lastAccessed: TS, accessCount: 0,
      } as never }),
    ]);

    const result = await processStaging('agent-1', makeStaging({ embedding: [1, 0] }));

    expect(result.duplicateResult.hasDuplicate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('processStaging - contradiction detection', () => {
  it('flags the 0.7-0.91 band with shared tags and returns a plain-English explanation', async () => {
    // [1,0] vs [1,1] => cosine ~0.7071 (in band); shared tag "billing".
    mockSemanticDocs = approvedDocs([
      makeSemantic({
        id: 'sem-conflict',
        content: 'The retainer is $8000',
        embedding: [1, 1],
        metadata: {
          source: 'conversation', confidence: 0.9, validationStatus: 'approved',
          tags: ['billing'], createdAt: TS, lastAccessed: TS, accessCount: 0,
        } as never,
      }),
    ]);

    const result = await processStaging(
      'agent-1',
      makeStaging({ embedding: [1, 0], metadata: {
        source: 'conversation', confidence: 0.5, validationStatus: 'staging',
        tags: ['billing'], createdAt: TS, lastAccessed: TS, accessCount: 0,
      } as never }),
    );

    expect(result.contradictionResult.hasContradiction).toBe(true);
    expect(result.contradictionResult.conflictingMemoryId).toBe('sem-conflict');

    const explanation = result.contradictionResult.explanation ?? '';
    // Plain-English, reviewer-facing: names the conflict, the similarity %,
    // the shared tag, and the reviewer instruction.
    expect(explanation).toContain('conflicts with');
    expect(explanation).toContain('The retainer is $8000');
    expect(explanation).toContain('71%'); // round(0.7071 * 100)
    expect(explanation).toContain('billing');
    expect(explanation).toContain('Approve only if both can be true');

    // A contradiction blocks auto-approval.
    expect(result.autoApproved).toBe(false);
  });

  it('does NOT flag a contradiction when tags do not overlap', async () => {
    mockSemanticDocs = approvedDocs([
      makeSemantic({
        id: 'sem-x',
        embedding: [1, 1],
        metadata: {
          source: 'conversation', confidence: 0.9, validationStatus: 'approved',
          tags: ['scheduling'], createdAt: TS, lastAccessed: TS, accessCount: 0,
        } as never,
      }),
    ]);

    const result = await processStaging(
      'agent-1',
      makeStaging({ embedding: [1, 0], metadata: {
        source: 'conversation', confidence: 0.5, validationStatus: 'staging',
        tags: ['billing'], createdAt: TS, lastAccessed: TS, accessCount: 0,
      } as never }),
    );

    expect(result.contradictionResult.hasContradiction).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('processStaging - clean memories', () => {
  it('passes a clearly-different memory with no duplicate and no contradiction', async () => {
    // Orthogonal embedding => similarity 0: neither duplicate nor contradiction.
    mockSemanticDocs = approvedDocs([makeSemantic({ id: 'sem-other', embedding: [0, 1] })]);

    const result = await processStaging('agent-1', makeStaging({ embedding: [1, 0] }));

    expect(result.duplicateResult.hasDuplicate).toBe(false);
    expect(result.contradictionResult.hasContradiction).toBe(false);
    expect(result.autoApproved).toBe(false); // low confidence, agent-proposed
    // The staging doc is still annotated with the (clean) check results.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('treats an empty semantic store as clean', async () => {
    mockSemanticDocs = [];
    const result = await processStaging('agent-1', makeStaging());
    expect(result.duplicateResult.hasDuplicate).toBe(false);
    expect(result.contradictionResult.hasContradiction).toBe(false);
  });
});
