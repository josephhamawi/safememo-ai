'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Mirror of MAX_DAILY_COST_USD in functions/src/cost/budgetGuard.ts. */
const DEFAULT_DAILY_CAP_USD = 5.0;

export interface DailyUsage {
  spentUSD: number;
  capUSD: number;
  utilization: number; // 0..1+
  loading: boolean;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Live subscription to the tenant's daily spend ledger and effective cap.
 *
 * Reads `users/{tenantId}/usage/{YYYY-MM-DD}` for spend (written by the
 * server-side budgetGuard) and `users/{tenantId}.dailyCapOverrideUSD` for
 * any per-tenant cap override.
 */
export function useDailyUsage(tenantId: string | null): DailyUsage {
  const [spentUSD, setSpentUSD] = useState(0);
  const [capUSD, setCapUSD] = useState(DEFAULT_DAILY_CAP_USD);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [capLoaded, setCapLoaded] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setSpentUSD(0);
      setUsageLoaded(true);
      return;
    }
    const ref = doc(db, `users/${tenantId}/usage/${todayUTC()}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const total = snap.exists() ? Number(snap.get('totalUSD')) || 0 : 0;
        setSpentUSD(total);
        setUsageLoaded(true);
      },
      () => {
        // Permission denied / offline — show zero rather than crash the UI
        setSpentUSD(0);
        setUsageLoaded(true);
      },
    );
    return unsub;
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setCapUSD(DEFAULT_DAILY_CAP_USD);
      setCapLoaded(true);
      return;
    }
    const ref = doc(db, `users/${tenantId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const override = snap.exists() ? snap.get('dailyCapOverrideUSD') : null;
        setCapUSD(
          typeof override === 'number' && override > 0
            ? override
            : DEFAULT_DAILY_CAP_USD,
        );
        setCapLoaded(true);
      },
      () => {
        setCapUSD(DEFAULT_DAILY_CAP_USD);
        setCapLoaded(true);
      },
    );
    return unsub;
  }, [tenantId]);

  const utilization = capUSD > 0 ? spentUSD / capUSD : 0;

  return {
    spentUSD,
    capUSD,
    utilization,
    loading: !usageLoaded || !capLoaded,
  };
}
