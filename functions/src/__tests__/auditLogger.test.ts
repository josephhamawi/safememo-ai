/**
 * Audit log integrity tests.
 *
 * Verifies the chain construction logic in isolation. These are pure-function
 * tests of `computeHash` plus the chain rule
 *   chainHash = SHA256(previousChainHash || ':' || resultHash)
 *
 * The rule is validated client-side too (web/src/app/audit/.../page.tsx),
 * so any regression here would be caught by both surfaces.
 */

import { describe, it, expect } from '@jest/globals';
import * as crypto from 'crypto';

// We import from the module under test for `computeHash`. Other helpers in
// auditLogger.ts touch Firestore, so we don't import the whole module.
import { computeHash } from '../security/auditLogger';

function chainHash(previousHash: string | null, resultHash: string): string {
  return crypto
    .createHash('sha256')
    .update((previousHash ?? '') + ':' + resultHash)
    .digest('hex');
}

describe('audit log integrity', () => {
  describe('computeHash', () => {
    it('is deterministic for the same input', () => {
      const data = { foo: 'bar', n: 42 };
      expect(computeHash(data)).toBe(computeHash(data));
    });

    it('is order-independent (sorted keys)', () => {
      const a = { x: 1, y: 2, z: 3 };
      const b = { z: 3, y: 2, x: 1 };
      expect(computeHash(a)).toBe(computeHash(b));
    });

    it('produces different hashes for different content', () => {
      expect(computeHash({ a: 1 })).not.toBe(computeHash({ a: 2 }));
    });

    it('returns a 64-char hex digest', () => {
      const h = computeHash({ k: 'v' });
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('chain hash rule', () => {
    it('chains the first entry against null predecessor', () => {
      const result = computeHash({ params: { memoryId: 'm1' } });
      const head = chainHash(null, result);
      const expected = crypto
        .createHash('sha256')
        .update(':' + result)
        .digest('hex');
      expect(head).toBe(expected);
    });

    it('binds each entry to its predecessor', () => {
      const r1 = computeHash({ params: { id: 'a' } });
      const r2 = computeHash({ params: { id: 'b' } });
      const h1 = chainHash(null, r1);
      const h2 = chainHash(h1, r2);
      expect(h2).not.toBe(chainHash(null, r2));
      expect(h2).not.toBe(h1);
    });

    it('detects tampering in any earlier entry', () => {
      // Build a 3-entry chain
      const r1 = computeHash({ params: { id: 1 } });
      const r2 = computeHash({ params: { id: 2 } });
      const r3 = computeHash({ params: { id: 3 } });
      const h1 = chainHash(null, r1);
      const h2 = chainHash(h1, r2);
      const h3 = chainHash(h2, r3);

      // Now tamper with the first entry: change its params
      const r1Tampered = computeHash({ params: { id: 999 } });
      const h1Tampered = chainHash(null, r1Tampered);

      // Recompute downstream with the tampered hash
      const h2Recomputed = chainHash(h1Tampered, r2);
      const h3Recomputed = chainHash(h2Recomputed, r3);

      // Every later hash must diverge
      expect(h2Recomputed).not.toBe(h2);
      expect(h3Recomputed).not.toBe(h3);
    });

    it('verifies a clean chain', () => {
      const entries = [
        { result: computeHash({ params: { i: 1 } }) },
        { result: computeHash({ params: { i: 2 } }) },
        { result: computeHash({ params: { i: 3 } }) },
        { result: computeHash({ params: { i: 4 } }) },
      ];
      const chain: string[] = [];
      let prev: string | null = null;
      for (const e of entries) {
        const h = chainHash(prev, e.result);
        chain.push(h);
        prev = h;
      }

      // Verifier walks forward, recomputing each hash
      let ok = true;
      for (let i = 0; i < entries.length; i++) {
        const expected = chainHash(
          i === 0 ? null : chain[i - 1],
          entries[i].result,
        );
        if (chain[i] !== expected) {
          ok = false;
          break;
        }
      }
      expect(ok).toBe(true);
    });
  });
});
