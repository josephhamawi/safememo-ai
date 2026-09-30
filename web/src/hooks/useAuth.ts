'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, auth as authApi, type SessionUser } from '@/lib/api';
import { useAppStore } from '@/store';

/**
 * Session state, backed by the self-hosted API instead of Firebase Auth.
 *
 * The session lives in a HttpOnly cookie, so there is no token in JS and
 * nothing to persist here — `/auth/me` is the single source of truth and is
 * re-checked on mount.
 */

export interface AuthUser extends SessionUser {
  /**
   * @deprecated Compatibility alias for the Firebase `User.uid` field that
   * call sites still read. Use `id`. Remove once every consumer is migrated.
   */
  uid: string;
}

interface AuthState {
  user: AuthUser | null;
  /** True when the account has no verified provider API key yet. */
  needsApiKey: boolean;
  loading: boolean;
}

// Module-level cache so several components mounting at once share one
// /auth/me round trip rather than each firing their own.
let cache: AuthState = { user: null, needsApiKey: false, loading: true };
let inflight: Promise<void> | null = null;
const subscribers = new Set<(state: AuthState) => void>();

function publish(next: AuthState): void {
  cache = next;
  for (const notify of subscribers) notify(next);
}

function toAuthUser(user: SessionUser): AuthUser {
  return { ...user, uid: user.id };
}

async function refresh(): Promise<void> {
  inflight ??= (async () => {
    try {
      const { user, needsApiKey } = await authApi.me();
      publish({ user: toAuthUser(user), needsApiKey, loading: false });
    } catch (err) {
      // 401 is the normal signed-out case, not an error worth surfacing.
      if (!(err instanceof ApiError) || err.status !== 401) {
        console.error('[auth] session check failed', err);
      }
      publish({ user: null, needsApiKey: false, loading: false });
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(cache);
  const setUserId = useAppStore((s) => s.setUserId);

  useEffect(() => {
    subscribers.add(setState);
    // Only fetch if nothing has resolved yet; later mounts reuse the cache.
    if (cache.loading) void refresh();
    else setState(cache);

    return () => {
      subscribers.delete(setState);
    };
  }, []);

  useEffect(() => {
    setUserId(state.user?.id ?? null);
  }, [state.user?.id, setUserId]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { user, needsApiKey } = await authApi.login({ email, password });
      publish({ user: toAuthUser(user), needsApiKey, loading: false });
      return { user: toAuthUser(user), needsApiKey };
    },
    [],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { user, needsApiKey } = await authApi.signup({
        email,
        password,
        ...(displayName ? { displayName } : {}),
      });
      publish({ user: toAuthUser(user), needsApiKey, loading: false });
      return { user: toAuthUser(user), needsApiKey };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => {
      // Clear locally even if the server call fails — the cookie is gone
      // from the user's perspective either way.
    });
    publish({ user: null, needsApiKey: false, loading: false });
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    needsApiKey: state.needsApiKey,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refresh,
  };
}

/** Invalidate the cached session — call after saving a first API key. */
export function invalidateAuthCache(): Promise<void> {
  return refresh();
}
