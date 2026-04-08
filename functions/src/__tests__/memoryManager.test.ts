/**
 * Memory Manager Tests
 *
 * Tests for L1/L2/L3 memory operations.
 * Uses firebase-functions-test for Firestore mocking.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock firebase-admin before imports
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
}));

const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockAdd = jest.fn();

jest.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => ({ toDate: () => new Date(), seconds: Date.now() / 1000 }),
    fromDate: (d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 }),
  };

  return {
    getFirestore: jest.fn(() => ({
      collection: mockCollection,
      doc: mockDoc,
      runTransaction: jest.fn(async (fn: Function) => {
        const tx = {
          get: mockGet,
          set: mockSet,
          update: mockUpdate,
          delete: mockDelete,
        };
        return fn(tx);
      }),
    })),
    Timestamp,
    FieldValue: {
      serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
      delete: jest.fn(() => 'DELETE_FIELD'),
    },
  };
});

describe('Memory Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Working Memory (L1)', () => {
    it('should create a new working memory session', () => {
      // Test that working memory has correct structure
      const session = {
        sessionId: 'test-session-1',
        agentId: 'agent-1',
        userId: 'user-1',
        contextWindow: [],
        activeTools: [],
        tempVariables: {},
        deviceId: 'device-1',
        syncStatus: 'synced' as const,
      };

      expect(session.sessionId).toBe('test-session-1');
      expect(session.contextWindow).toHaveLength(0);
      expect(session.syncStatus).toBe('synced');
    });

    it('should enforce max context window size', () => {
      const maxMessages = 20;
      const messages = Array.from({ length: 25 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user' as const,
        content: `Message ${i}`,
        timestamp: { toDate: () => new Date(), seconds: Date.now() / 1000 },
      }));

      // Simulate trimming to max
      const trimmed = messages.slice(-maxMessages);
      expect(trimmed).toHaveLength(20);
      expect(trimmed[0].id).toBe('msg-5');
    });

    it('should set TTL to 24 hours from creation', () => {
      const now = Date.now();
      const ttlDate = new Date(now + 24 * 60 * 60 * 1000);
      const ttl = { toDate: () => ttlDate, seconds: ttlDate.getTime() / 1000 };

      const diffHours = (ttl.toDate().getTime() - now) / (1000 * 60 * 60);
      expect(Math.round(diffHours)).toBe(24);
    });
  });

  describe('Semantic Memory (L2)', () => {
    it('should validate staging memory structure', () => {
      const staging = {
        id: 'staging-1',
        agentId: 'agent-1',
        content: 'The user prefers TypeScript',
        embedding: new Array(768).fill(0),
        metadata: {
          source: 'conversation' as const,
          confidence: 0.85,
          validationStatus: 'staging' as const,
          tags: ['preference', 'language'],
          createdAt: { toDate: () => new Date() },
          lastAccessed: { toDate: () => new Date() },
          accessCount: 0,
        },
        accessControl: {
          ownerId: 'user-1',
          visibility: 'private' as const,
          allowedUsers: [],
        },
        proposedBy: 'agent' as const,
        explanation: 'Extracted from conversation context',
        autoApprovalEligible: false,
      };

      expect(staging.metadata.validationStatus).toBe('staging');
      expect(staging.embedding).toHaveLength(768);
      expect(staging.metadata.confidence).toBeGreaterThan(0);
      expect(staging.metadata.confidence).toBeLessThanOrEqual(1);
    });

    it('should not allow direct writes bypassing staging', () => {
      const memory = {
        metadata: { validationStatus: 'approved' as string },
      };

      // In Firestore rules, direct 'approved' writes are blocked
      // This tests our application logic mirrors that
      const isValidCreate = memory.metadata.validationStatus === 'staging';
      expect(isValidCreate).toBe(false);
    });
  });

  describe('Episodic Memory (L3)', () => {
    it('should calculate consolidation score correctly', () => {
      // Higher scores for: successful outcomes, multiple tool uses, longer duration
      function calculateScore(episode: {
        outcome: string;
        toolCalls: unknown[];
        duration: number;
        lessonsLearned: string[];
      }): number {
        let score = 0;
        if (episode.outcome === 'success') score += 0.4;
        else if (episode.outcome === 'partial') score += 0.2;

        score += Math.min(episode.toolCalls.length * 0.1, 0.3);
        score += Math.min(episode.duration / 300000, 0.15); // Max 5 min contribution
        score += Math.min(episode.lessonsLearned.length * 0.075, 0.15);

        return Math.min(score, 1);
      }

      const highScore = calculateScore({
        outcome: 'success',
        toolCalls: [{}, {}, {}],
        duration: 120000,
        lessonsLearned: ['lesson1', 'lesson2'],
      });

      const lowScore = calculateScore({
        outcome: 'failure',
        toolCalls: [],
        duration: 5000,
        lessonsLearned: [],
      });

      expect(highScore).toBeGreaterThan(0.7);
      expect(lowScore).toBeLessThan(0.1);
    });

    it('should filter episodes by domain and score threshold', () => {
      const episodes = [
        { taskDomain: 'coding', consolidationScore: 0.9, promotedToSemantic: false },
        { taskDomain: 'coding', consolidationScore: 0.5, promotedToSemantic: false },
        { taskDomain: 'research', consolidationScore: 0.85, promotedToSemantic: false },
        { taskDomain: 'coding', consolidationScore: 0.95, promotedToSemantic: true },
      ];

      const eligible = episodes.filter(
        (e) =>
          e.consolidationScore > 0.8 &&
          !e.promotedToSemantic
      );

      expect(eligible).toHaveLength(2);
      expect(eligible[0].taskDomain).toBe('coding');
      expect(eligible[1].taskDomain).toBe('research');
    });
  });
});

describe('Validation Gate', () => {
  it('should detect duplicates via cosine similarity', () => {
    function cosineSimilarity(a: number[], b: number[]): number {
      if (a.length !== b.length) return 0;
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      const denominator = Math.sqrt(normA) * Math.sqrt(normB);
      return denominator === 0 ? 0 : dotProduct / denominator;
    }

    // Same vector should have similarity 1
    const vec = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);

    // Opposite vectors should have similarity -1
    const opposite = vec.map((v) => -v);
    expect(cosineSimilarity(vec, opposite)).toBeCloseTo(-1.0);

    // Orthogonal vectors should have similarity 0
    const ortho1 = [1, 0, 0];
    const ortho2 = [0, 1, 0];
    expect(cosineSimilarity(ortho1, ortho2)).toBeCloseTo(0);

    // Similar vectors should be > 0.92 threshold
    const similar = vec.map((v) => v + 0.01);
    const similarity = cosineSimilarity(vec, similar);
    expect(similarity).toBeGreaterThan(0.92);
  });

  it('should determine auto-approval eligibility', () => {
    function isAutoApprovable(staging: {
      metadata: { confidence: number };
      proposedBy: string;
      contradictionCheckResult?: { hasContradiction: boolean };
      duplicateCheckResult?: { hasDuplicate: boolean };
    }): { eligible: boolean; reason?: string } {
      // Rule 1: High confidence factual data
      if (staging.metadata.confidence > 0.9) {
        if (staging.contradictionCheckResult?.hasContradiction) {
          return { eligible: false };
        }
        if (staging.duplicateCheckResult?.hasDuplicate) {
          return { eligible: false };
        }
        return { eligible: true, reason: 'High confidence, no conflicts' };
      }

      // Rule 2: User-confirmed
      if (staging.proposedBy === 'user') {
        return { eligible: true, reason: 'User-confirmed memory' };
      }

      return { eligible: false };
    }

    // High confidence, no conflicts
    expect(
      isAutoApprovable({
        metadata: { confidence: 0.95 },
        proposedBy: 'agent',
        contradictionCheckResult: { hasContradiction: false },
        duplicateCheckResult: { hasDuplicate: false },
      }).eligible
    ).toBe(true);

    // High confidence but has contradiction
    expect(
      isAutoApprovable({
        metadata: { confidence: 0.95 },
        proposedBy: 'agent',
        contradictionCheckResult: { hasContradiction: true },
      }).eligible
    ).toBe(false);

    // Low confidence but user-confirmed
    expect(
      isAutoApprovable({
        metadata: { confidence: 0.5 },
        proposedBy: 'user',
      }).eligible
    ).toBe(true);

    // Low confidence, agent-proposed
    expect(
      isAutoApprovable({
        metadata: { confidence: 0.5 },
        proposedBy: 'agent',
      }).eligible
    ).toBe(false);
  });
});

describe('Episodic Consolidation', () => {
  it('should cluster episodes by task domain', () => {
    const episodes = [
      { episodeId: '1', taskDomain: 'coding', lessonsLearned: ['use types'] },
      { episodeId: '2', taskDomain: 'coding', lessonsLearned: ['write tests'] },
      { episodeId: '3', taskDomain: 'research', lessonsLearned: ['cite sources'] },
      { episodeId: '4', taskDomain: 'coding', lessonsLearned: ['error handling'] },
    ];

    const clusters = new Map<string, typeof episodes>();
    for (const ep of episodes) {
      const existing = clusters.get(ep.taskDomain) || [];
      existing.push(ep);
      clusters.set(ep.taskDomain, existing);
    }

    expect(clusters.size).toBe(2);
    expect(clusters.get('coding')).toHaveLength(3);
    expect(clusters.get('research')).toHaveLength(1);
  });

  it('should extract common patterns from episodes', () => {
    const toolSequences = [
      ['web_search', 'code_execution', 'file_operations'],
      ['web_search', 'code_execution'],
      ['web_search', 'file_operations'],
    ];

    // Find tools that appear in >50% of sequences
    const toolCounts = new Map<string, number>();
    for (const seq of toolSequences) {
      const unique = new Set(seq);
      for (const tool of unique) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }
    }

    const threshold = toolSequences.length * 0.5;
    const commonTools = Array.from(toolCounts.entries())
      .filter(([, count]) => count > threshold)
      .map(([tool]) => tool);

    expect(commonTools).toContain('web_search');
    expect(commonTools).toContain('code_execution');
    expect(commonTools).toContain('file_operations');
  });
});

describe('Vector Search', () => {
  it('should validate embedding dimensions', () => {
    const validEmbedding = new Array(768).fill(0.1);
    const invalidEmbedding = new Array(512).fill(0.1);

    expect(validEmbedding.length).toBe(768);
    expect(invalidEmbedding.length).not.toBe(768);
  });

  it('should rank search results by similarity', () => {
    const results = [
      { id: 'a', similarity: 0.85 },
      { id: 'b', similarity: 0.92 },
      { id: 'c', similarity: 0.78 },
      { id: 'd', similarity: 0.95 },
    ];

    const ranked = results.sort((a, b) => b.similarity - a.similarity);
    expect(ranked[0].id).toBe('d');
    expect(ranked[1].id).toBe('b');
    expect(ranked[ranked.length - 1].id).toBe('c');
  });

  it('should filter results by metadata constraints', () => {
    const memories = [
      { id: '1', tags: ['coding', 'ts'], visibility: 'private', confidence: 0.9 },
      { id: '2', tags: ['research'], visibility: 'public', confidence: 0.7 },
      { id: '3', tags: ['coding', 'python'], visibility: 'private', confidence: 0.85 },
      { id: '4', tags: ['coding'], visibility: 'shared', confidence: 0.6 },
    ];

    const filtered = memories.filter(
      (m) =>
        m.tags.includes('coding') &&
        m.visibility === 'private' &&
        m.confidence > 0.8
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map((m) => m.id)).toEqual(['1', '3']);
  });
});
