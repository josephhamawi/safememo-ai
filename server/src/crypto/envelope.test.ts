import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  DecryptionError,
  MasterKeyError,
  type CredentialContext,
  keyLast4,
  openCredential,
  parseMasterKey,
  rewrapCredential,
  sealCredential,
} from './envelope';

const master = (id = 'k1') =>
  parseMasterKey(id, randomBytes(32).toString('base64'));

const ctx: CredentialContext = {
  credentialId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  provider: 'anthropic',
};

const API_KEY = 'sk-ant-api03-EXAMPLE-not-a-real-key-0123456789';

describe('parseMasterKey', () => {
  it('accepts a 32-byte base64 key', () => {
    const raw = randomBytes(32);
    const mk = parseMasterKey('k1', raw.toString('base64'));
    expect(mk.key.equals(raw)).toBe(true);
    expect(mk.id).toBe('k1');
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => parseMasterKey('k1', randomBytes(16).toString('base64'))).toThrow(
      MasterKeyError,
    );
    expect(() => parseMasterKey('k1', randomBytes(64).toString('base64'))).toThrow(
      MasterKeyError,
    );
  });

  it('rejects an all-zero key', () => {
    expect(() =>
      parseMasterKey('k1', Buffer.alloc(32).toString('base64')),
    ).toThrow(/all zeroes/);
  });

  it('rejects a malformed key id', () => {
    const b64 = randomBytes(32).toString('base64');
    expect(() => parseMasterKey('', b64)).toThrow(MasterKeyError);
    expect(() => parseMasterKey('has space', b64)).toThrow(MasterKeyError);
  });
});

describe('seal / open round trip', () => {
  it('recovers the original key', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    expect(openCredential(mk, ctx, sealed).toString('utf8')).toBe(API_KEY);
  });

  it('never stores the plaintext in any field', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    const blob = Buffer.concat([
      sealed.keyCiphertext,
      sealed.keyIv,
      sealed.keyTag,
      sealed.wrappedDek,
      sealed.dekIv,
      sealed.dekTag,
    ]).toString('latin1');
    expect(blob).not.toContain(API_KEY);
    expect(blob).not.toContain('sk-ant');
  });

  it('produces different ciphertext for the same input each time', () => {
    const mk = master();
    const a = sealCredential(mk, ctx, API_KEY);
    const b = sealCredential(mk, ctx, API_KEY);
    // Fresh DEK and fresh IVs, so nothing repeats.
    expect(a.keyCiphertext.equals(b.keyCiphertext)).toBe(false);
    expect(a.wrappedDek.equals(b.wrappedDek)).toBe(false);
    expect(a.keyIv.equals(b.keyIv)).toBe(false);
  });

  it('handles unicode and long keys', () => {
    const mk = master();
    for (const secret of ['ключ-🔐-ключ', 'x'.repeat(4096)]) {
      const sealed = sealCredential(mk, ctx, secret);
      expect(openCredential(mk, ctx, sealed).toString('utf8')).toBe(secret);
    }
  });
});

describe('tamper and confused-deputy resistance', () => {
  it('rejects a wrong master key', () => {
    const sealed = sealCredential(master('k1'), ctx, API_KEY);
    // Same key id, different key material.
    const impostor = parseMasterKey('k1', randomBytes(32).toString('base64'));
    expect(() => openCredential(impostor, ctx, sealed)).toThrow(DecryptionError);
  });

  it('rejects a row transplanted to another user', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    const attacker = { ...ctx, userId: '33333333-3333-4333-8333-333333333333' };
    expect(() => openCredential(mk, attacker, sealed)).toThrow(DecryptionError);
  });

  it('rejects a row relabelled to another provider', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    expect(() =>
      openCredential(mk, { ...ctx, provider: 'openai' }, sealed),
    ).toThrow(DecryptionError);
  });

  it('rejects a row relabelled to another credential id', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    expect(() =>
      openCredential(mk, { ...ctx, credentialId: ctx.userId }, sealed),
    ).toThrow(DecryptionError);
  });

  it('rejects flipped bits in the ciphertext', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    const tampered = { ...sealed, keyCiphertext: Buffer.from(sealed.keyCiphertext) };
    tampered.keyCiphertext[0] ^= 0xff;
    expect(() => openCredential(mk, ctx, tampered)).toThrow(DecryptionError);
  });

  it('rejects flipped bits in the wrapped DEK', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    const tampered = { ...sealed, wrappedDek: Buffer.from(sealed.wrappedDek) };
    tampered.wrappedDek[0] ^= 0xff;
    expect(() => openCredential(mk, ctx, tampered)).toThrow(DecryptionError);
  });

  it('rejects a swapped auth tag', () => {
    const mk = master();
    const a = sealCredential(mk, ctx, API_KEY);
    const b = sealCredential(mk, ctx, API_KEY);
    expect(() => openCredential(mk, ctx, { ...a, keyTag: b.keyTag })).toThrow(
      DecryptionError,
    );
  });

  it('rejects a truncated iv or tag instead of crashing', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    expect(() =>
      openCredential(mk, ctx, { ...sealed, keyIv: sealed.keyIv.subarray(0, 8) }),
    ).toThrow(DecryptionError);
    expect(() =>
      openCredential(mk, ctx, { ...sealed, keyTag: sealed.keyTag.subarray(0, 8) }),
    ).toThrow(DecryptionError);
  });

  it('does not leak the plaintext or the key in the error message', () => {
    const mk = master();
    const sealed = sealCredential(mk, ctx, API_KEY);
    try {
      openCredential(mk, { ...ctx, userId: 'someone-else' }, sealed);
      expect.unreachable('should have thrown');
    } catch (err) {
      const text = String(err) + JSON.stringify((err as Error).message);
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain('sk-ant');
    }
  });
});

describe('master key rotation', () => {
  it('re-wraps under a new key without touching the payload', () => {
    const oldKey = master('k1');
    const newKey = master('k2');
    const sealed = sealCredential(oldKey, ctx, API_KEY);

    const rotated = rewrapCredential(oldKey, newKey, ctx, sealed);

    expect(rotated.masterKeyId).toBe('k2');
    // The expensive layer is untouched — that is the point of envelopes.
    expect(rotated.keyCiphertext.equals(sealed.keyCiphertext)).toBe(true);
    expect(openCredential(newKey, ctx, rotated).toString('utf8')).toBe(API_KEY);
  });

  it('refuses the retired key after rotation', () => {
    const oldKey = master('k1');
    const newKey = master('k2');
    const rotated = rewrapCredential(
      oldKey,
      newKey,
      ctx,
      sealCredential(oldKey, ctx, API_KEY),
    );
    expect(() => openCredential(oldKey, ctx, rotated)).toThrow(DecryptionError);
  });

  it('flags a generation mismatch on detail, not on the public message', () => {
    const k1 = master('k1');
    const k2 = master('k2');
    const sealed = sealCredential(k1, ctx, API_KEY);

    try {
      openCredential(k2, ctx, sealed);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DecryptionError);
      // Uniform for the caller...
      expect((err as Error).message).toBe('Failed to decrypt credential');
      // ...specific for the operator reading logs.
      expect((err as DecryptionError).detail).toMatch(/master key/);
      expect((err as DecryptionError).detail).toContain('k1');
    }
  });
});

describe('keyLast4', () => {
  it('returns the final four characters', () => {
    expect(keyLast4('sk-ant-abcd1234')).toBe('1234');
  });

  it('pads a short key rather than revealing all of it', () => {
    expect(keyLast4('ab')).toBe('**ab');
  });
});
