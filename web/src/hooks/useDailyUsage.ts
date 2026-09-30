'use client';

import { usage as usageApi, type Usage } from '@/lib/api';
import { useResource } from './useResource';

export interface DailyUsage {
  requests: number;
  limit: number;
  utilization: number;
  loading: boolean;
}

/**
 * Daily request usage against this instance's ceiling.
 *
 * This used to show dollars spent against a $5/day cap. Under bring-your-own-key
 * the user is billed by their provider directly, so this server has no view of
 * their spend and no business capping it — the limit here guards this
 * instance's own resources.
 */
export function useDailyUsage(userId: string | null): DailyUsage {
  const { data, loading } = useResource<Usage>(
    () => usageApi.today(),
    [userId],
    { enabled: !!userId, refreshMs: 60_000 },
  );

  const requests = data?.requests ?? 0;
  const limit = data?.limit ?? 0;

  return {
    requests,
    limit,
    utilization: limit > 0 ? requests / limit : 0,
    loading,
  };
}
