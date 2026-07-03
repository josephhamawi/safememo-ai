/**
 * Sign-up allowlist gate (Firebase Auth blocking function).
 *
 * The pivoted product is invite-only: the public front door is the
 * demo / early-access form, not self-serve sign-up. This blocking function
 * enforces that at the Identity Platform layer, so it covers every provider
 * (email/password, Google, GitHub, ...) — hiding the sign-up UI is not enough,
 * because OAuth first-use would otherwise silently provision a new tenant.
 *
 * An account may be created only if its email is allowlisted by ONE of:
 *   1. the bootstrap list in SIGNUP_ALLOWLIST_BOOTSTRAP (comma-separated) —
 *      always checked first so a Firestore outage can't lock the founder out;
 *   2. an `allowlist/{email}` doc (per-person invite), unless `enabled: false`;
 *   3. an `allowlistDomains/{domain}` doc (onboard a whole firm by email domain).
 *
 * Approval workflow: an admin reviews `earlyAccessRequests` in the dashboard,
 * then adds an `allowlist/{lowercased-email}` doc (or an `allowlistDomains`
 * entry for the firm). Keeping approval an explicit admin write — rather than
 * auto-trusting the self-submitted early-access email — is the point on a
 * compliance product.
 *
 * Fail-closed: any error, or no match, blocks account creation. This is the
 * correct default for a compliance-bound product — better to turn away a
 * legitimate user (who can be added to the allowlist) than to admit a stranger.
 *
 * REQUIRES Identity Platform (GCIP) enabled on the project and the blocking
 * function registered under Authentication → Settings → Blocking functions.
 * See ROADMAP / the deploy runbook.
 */

import { beforeUserCreated } from 'firebase-functions/v2/identity';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

// Non-secret param: comma-separated emails that are always allowed. Set with
// `firebase functions:config` is deprecated — set the env var / .env value
// SIGNUP_ALLOWLIST_BOOTSTRAP (e.g. "founder@firm.com,ops@firm.com").
const bootstrapAllowlist = defineString('SIGNUP_ALLOWLIST_BOOTSTRAP', {
  default: '',
});

const db = () => getFirestore();

/** Lowercase + trim an email for use as a stable allowlist key. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Parse the comma-separated bootstrap list into a normalized set. */
function bootstrapSet(): Set<string> {
  return new Set(
    bootstrapAllowlist
      .value()
      .split(',')
      .map((e) => normalizeEmail(e))
      .filter((e) => e.length > 0),
  );
}

/**
 * Return true if `email` is permitted to create an account.
 * Throws only on a programming error; Firestore lookup failures are caught by
 * the caller and treated as "not allowed" (fail-closed).
 */
export async function isAllowed(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  // 1. Bootstrap list — checked before any I/O so an outage can't lock it out.
  if (bootstrapSet().has(normalized)) return true;

  const firestore = db();

  // 2. Per-person allowlist entry.
  const personSnap = await firestore.doc(`allowlist/${normalized}`).get();
  if (personSnap.exists && personSnap.data()?.enabled !== false) return true;

  // 3. Domain allowlist entry (everything after the @).
  const atIdx = normalized.lastIndexOf('@');
  const domain = atIdx >= 0 ? normalized.slice(atIdx + 1) : '';
  if (domain) {
    const domainSnap = await firestore.doc(`allowlistDomains/${domain}`).get();
    if (domainSnap.exists && domainSnap.data()?.enabled !== false) return true;
  }

  return false;
}

/**
 * Blocking function: runs before a new user is created for ANY provider.
 * Returning normally allows creation; throwing HttpsError blocks it.
 */
export const beforeSignupGate = beforeUserCreated(
  {
    region: 'us-central1',
    // Keep this small and warm-ish; every account creation waits on it.
    memory: '256MiB',
    timeoutSeconds: 10,
    maxInstances: 20,
  },
  async (event) => {
    const email = event.data?.email;

    // No email on the credential — block. Every intended sign-in path here
    // carries an email (email/password, Google, GitHub with email scope).
    if (!email) {
      logger.warn('Signup gate: blocked credential with no email', {
        uid: event.data?.uid,
      });
      throw new HttpsError(
        'permission-denied',
        'Noomachy is invite-only. Request access at noomachy.com.',
      );
    }

    let allowed = false;
    try {
      allowed = await isAllowed(email);
    } catch (err) {
      // Fail-closed on any lookup error.
      logger.error('Signup gate: allowlist lookup failed — blocking', {
        email: normalizeEmail(email),
        error: err,
      });
      throw new HttpsError(
        'permission-denied',
        'Noomachy is invite-only. Request access at noomachy.com.',
      );
    }

    if (!allowed) {
      logger.info('Signup gate: blocked non-allowlisted signup', {
        email: normalizeEmail(email),
      });
      throw new HttpsError(
        'permission-denied',
        'This email is not on the Noomachy access list. Request access at noomachy.com.',
      );
    }

    logger.info('Signup gate: allowed', { email: normalizeEmail(email) });
    // Returning undefined allows the account to be created unchanged.
  },
);
