'use client';

import { profile as profileApi } from '@/lib/api';
import { useAuth } from './useAuth';
import { useResource } from './useResource';

export function useUserProfile() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useResource(
    () => profileApi.get(),
    [user?.id],
    { enabled: !!user },
  );

  return {
    profile: data?.profile ?? null,
    usage: data?.usage ?? null,
    loading,
    error,
    refresh,
  };
}
