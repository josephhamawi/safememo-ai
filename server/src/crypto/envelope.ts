/**
 * Envelope encryption for bring-your-own-key provider credentials.
 *
 * Two layers, both AES-256-GCM:
 *
 *   plaintext API key  --sealed under-->  DEK (random, per credential)
 *   DEK                --sealed under-->  master key (MASTER_ENCRYPTION_KEY)
 *
 * The master key never touches the API-key ciphertext, so rotating it only
 * re-wraps DEKs. That keeps rotation cheap and lets it run incrementally:
 * every row records the master_key_id that sealed it, so a half-finished
 * rotation still decrypts correctly.
 *
 * Both layers authenticate additional data (AAD) derived from the credential's
 * identity. A row lifted out of one user's record and pasted into another's
 * fails the GCM tag check rather than decrypting — this is what stops a
 * database-write primitive from turning into "use someone else's API key".
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the GCM-recommended size
const TAG_BYTES = 16;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown for every decryption failure.
 *
 * `message` is deliberately uniform: distinguishing "wrong master key" from
 * "tampered ciphertext" from "wrong AAD" in a response would hand an attacker
 * an oracle. Operator-facing specifics go on `detail`, which is for logs only
 * and must never be serialized into an HTTP response.
 */
export class DecryptionError extends Error {
  readonly detail: string | undefined;

  constructor(options?: { detail?: string; cause?: unknown }) {
    super('Failed to decrypt credential');
    this.name = 'DecryptionError';
    this.detail = options?.detail;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export class MasterKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MasterKeyError';
  }
}

// ---------------------------------------------------------------------------
// Master key
// ---------------------------------------------------------------------------

export interface MasterKey {
  id: string;
  key: Buffer;
}

/**
 * Parse a base64 master key and refuse anything that is not exactly 32 bytes.
 *
 * Short keys are rejected rather than stretched. Padding or hashing a weak
 * value would produce a working system with a key far below its nominal
 * strength, and the operator would have no signal that anything was wrong.
 */
export function parseMasterKey(id: string, base64Key: string): MasterKey {
  if (!id || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
    throw new MasterKeyError(
      'MASTER_ENCRYPTION_KEY_ID must be 1-32 chars of [A-Za-z0-9_-]',
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(base64Key, 'base64');
  } catch {
    throw new MasterKeyError('MASTER_ENCRYPTION_KEY is not valid base64');
  }

  if (key.length !== KEY_BYTES) {
    throw new MasterKeyError(
      `MASTER_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes ` +
        `(got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }

  // An all-zero key is almost always a placeholder that made it to production.
  if (key.every((b) => b === 0)) {
    throw new MasterKeyError('MASTER_ENCRYPTION_KEY must not be all zeroes');
  }

  return { id, key };
}

// ---------------------------------------------------------------------------
// Sealed record
// ---------------------------------------------------------------------------

/** Ciphertext plus the parameters needed to open it. Safe to persist. */
export interface SealedCredential {
  keyCiphertext: Buffer;
  keyIv: Buffer;
  keyTag: Buffer;
  wrappedDek: Buffer;
  dekIv: Buffer;
  dekTag: Buffer;
  masterKeyId: string;
}

/**
 * Identity the ciphertext is cryptographically bound to. All three fields are
 * mixed into the AAD of both layers, so the sealed bytes are only openable in
 * the exact row they were created for.
 */
export interface CredentialContext {
  credentialId: string;
  userId: string;
  provider: string;
}

function aad(ctx: CredentialContext, layer: 'dek' | 'key'): Buffer {
  // Length-prefixed rather than delimiter-joined: a provider literally named
  // "anthropic|…" must not be able to shift the field boundaries.
  const parts = [layer, ctx.credentialId, ctx.userId, ctx.provider];
  const encoded = parts.map((p) => {
    const buf = Buffer.from(p, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length, 0);
    return Buffer.concat([len, buf]);
  });
  return Buffer.concat(encoded);
}

interface GcmResult {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

function gcmEncrypt(key: Buffer, plaintext: Buffer, ad: Buffer): GcmResult {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(ad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function gcmDecrypt(
  key: Buffer,
  { ciphertext, iv, tag }: GcmResult,
  ad: Buffer,
): Buffer {
  if (iv.length !== IV_BYTES) throw new DecryptionError({ detail: 'bad iv length' });
  if (tag.length !== TAG_BYTES)
    throw new DecryptionError({ detail: 'bad tag length' });

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(ad);
  decipher.setAuthTag(tag);
  // final() throws if the tag does not verify — this is the integrity check.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seal a provider API key. The caller supplies the credential id so the AAD is
 * fixed before the row exists — do not let the database generate it.
 */
export function sealCredential(
  master: MasterKey,
  ctx: CredentialContext,
  apiKey: string,
): SealedCredential {
  if (!apiKey) throw new Error('apiKey must not be empty');

  const dek = randomBytes(KEY_BYTES);
  const plaintext = Buffer.from(apiKey, 'utf8');

  try {
    const sealedKey = gcmEncrypt(dek, plaintext, aad(ctx, 'key'));
    const sealedDek = gcmEncrypt(master.key, dek, aad(ctx, 'dek'));

    return {
      keyCiphertext: sealedKey.ciphertext,
      keyIv: sealedKey.iv,
      keyTag: sealedKey.tag,
      wrappedDek: sealedDek.ciphertext,
      dekIv: sealedDek.iv,
      dekTag: sealedDek.tag,
      masterKeyId: master.id,
    };
  } finally {
    // Wipe the DEK and the plaintext copy. The original `apiKey` string cannot
    // be wiped — JS strings are immutable — which is why callers should hand
    // the key straight here and never park it on a long-lived object.
    dek.fill(0);
    plaintext.fill(0);
  }
}

/**
 * Open a sealed credential. Returns a Buffer so the caller can zero it after
 * use; `.toString('utf8')` creates an unwipeable copy, so do it as late as
 * possible and let it go out of scope immediately.
 */
export function openCredential(
  master: MasterKey,
  ctx: CredentialContext,
  sealed: SealedCredential,
): Buffer {
  if (!timingSafeEqualStr(master.id, sealed.masterKeyId)) {
    // Wrong master key generation for this row. Surfaces during a partially
    // completed rotation; the caller should retry with the retired key.
    throw new DecryptionError({
      detail:
        `credential sealed under master key "${sealed.masterKeyId}", ` +
        `server is configured with "${master.id}"`,
    });
  }

  let dek: Buffer | undefined;
  try {
    dek = gcmDecrypt(
      master.key,
      { ciphertext: sealed.wrappedDek, iv: sealed.dekIv, tag: sealed.dekTag },
      aad(ctx, 'dek'),
    );
    return gcmDecrypt(
      dek,
      { ciphertext: sealed.keyCiphertext, iv: sealed.keyIv, tag: sealed.keyTag },
      aad(ctx, 'key'),
    );
  } catch (err) {
    if (err instanceof DecryptionError) throw err;
    throw new DecryptionError({ cause: err });
  } finally {
    dek?.fill(0);
  }
}

/**
 * Re-wrap a DEK under a new master key without touching the API-key
 * ciphertext. Used by the master-key rotation command.
 */
export function rewrapCredential(
  oldMaster: MasterKey,
  newMaster: MasterKey,
  ctx: CredentialContext,
  sealed: SealedCredential,
): SealedCredential {
  let dek: Buffer | undefined;
  try {
    dek = gcmDecrypt(
      oldMaster.key,
      { ciphertext: sealed.wrappedDek, iv: sealed.dekIv, tag: sealed.dekTag },
      aad(ctx, 'dek'),
    );
    const rewrapped = gcmEncrypt(newMaster.key, dek, aad(ctx, 'dek'));
    return {
      ...sealed,
      wrappedDek: rewrapped.ciphertext,
      dekIv: rewrapped.iv,
      dekTag: rewrapped.tag,
      masterKeyId: newMaster.id,
    };
  } catch (err) {
    if (err instanceof DecryptionError) throw err;
    throw new DecryptionError({ cause: err });
  } finally {
    dek?.fill(0);
  }
}

/** Constant-time string compare that tolerates differing lengths. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Last four characters of a key, for display. Never derive anything from it. */
export function keyLast4(apiKey: string): string {
  return apiKey.slice(-4).padStart(4, '*');
}
