'use client';

import { useAuth } from '@/hooks/useAuth';
import { useDailyUsage } from '@/hooks/useDailyUsage';
import { Gauge } from 'lucide-react';

/**
 * Compact sidebar badge showing today's spend against the per-tenant cap.
 *
 * Reads `users/{tenantId}/usage/{today}.totalUSD` (server-incremented by
 * budgetGuard) and the cap from `users/{tenantId}.dailyCapOverrideUSD`.
 * Stays silent until a number is loaded so the sidebar doesn't flash.
 */
export default function DailyUsageBadge() {
  const { user } = useAuth();
  const { spentUSD, capUSD, utilization, loading } = useDailyUsage(
    user?.uid ?? null,
  );

  if (!user || loading) return null;

  const pct = Math.min(Math.round(utilization * 100), 100);
  const tone =
    utilization >= 1
      ? 'text-red-400 bg-red-500/10 border-red-500/20'
      : utilization >= 0.8
      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
      : 'text-zinc-400 bg-zinc-900 border-zinc-800';

  const barTone =
    utilization >= 1
      ? 'bg-red-500'
      : utilization >= 0.8
      ? 'bg-yellow-500'
      : 'bg-orange-500';

  return (
    <div
      className={`group relative mx-2 mt-1 mb-2 rounded-md border px-2.5 py-2 text-[11px] ${tone}`}
      title={
        utilization >= 1
          ? 'Daily cap reached. Resets at 00:00 UTC.'
          : 'Daily spend across LLM, embeddings, and memory writes. Resets at 00:00 UTC.'
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-medium">
          <Gauge className="h-3 w-3" />
          Daily usage
        </span>
        <span className="font-mono">
          ${spentUSD.toFixed(2)} / ${capUSD.toFixed(2)}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={`h-full transition-all ${barTone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
