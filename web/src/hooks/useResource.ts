'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fetch-and-refresh replacement for the Firestore `onSnapshot` hooks.
 *
 * Firestore pushed changes over a live socket; a REST API cannot, so anything
 * that needs to stay current polls. `refreshMs` is opt-in per call site rather
 * than a global default — most screens only need a refetch after their own
 * mutations, and polling everything would multiply request volume for no
 * visible benefit.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean; refreshMs?: number } = {},
) {
  const { enabled = true, refreshMs } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  // Held in a ref so changing the fetcher identity between renders does not
  // restart the effect — only `deps` should do that.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetcherRef.current();
      if (signal?.aborted) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Guards against a slow first response overwriting a newer one after the
    // dependencies changed.
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);

    if (!refreshMs) return () => controller.abort();

    const interval = setInterval(() => {
      // Skip polling while the tab is hidden; a background tab refreshing
      // every few seconds is pure waste.
      if (document.visibilityState === 'visible') void load(controller.signal);
    }, refreshMs);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshMs, load, ...deps]);

  const refresh = useCallback(() => load(), [load]);

  return { data, loading, error, refresh, setData };
}
