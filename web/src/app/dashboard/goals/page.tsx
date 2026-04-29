'use client';

import { useMemo, useState } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/store';
import type { Goal, GoalStatus } from '@/types';
import {
  Zap, Plus, Pause, Play, Trash2, Clock, AlertTriangle,
  CheckCircle2, Loader2, ArrowRight, Bot,
} from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';

const SCHEDULE_PRESETS = [
  { label: 'Every 15 minutes', value: 'every 15m' },
  { label: 'Hourly', value: 'every 1h' },
  { label: 'Daily at 09:00 UTC', value: 'daily 09:00' },
  { label: 'Weekly (Mon 09:00 UTC)', value: 'weekly Mon 09:00' },
  { label: 'Run once now', value: 'once' },
];

function formatTimestamp(ts?: Timestamp): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return d.toLocaleString();
}

function statusBadge(status: GoalStatus): { label: string; cls: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    case 'paused':
      return { label: 'Paused', cls: 'bg-zinc-700/40 text-zinc-300 border-zinc-700' };
    case 'completed':
      return { label: 'Completed', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' };
    case 'error':
      return { label: 'Error', cls: 'bg-red-500/10 text-red-400 border-red-500/30' };
  }
}

export default function GoalsPage() {
  const { user } = useAuth();
  const agents = useAppStore((s) => s.agents);
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const browserTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
  }, []);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [schedule, setSchedule] = useState('every 1h');
  const [timezone, setTimezone] = useState<string>(browserTimezone);
  const [agentId, setAgentId] = useState<string>(selectedAgentId ?? '');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'goals'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const activeAgentId = agentId || selectedAgentId || agents[0]?.id || '';
  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId),
    [agents, activeAgentId],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeAgentId) {
      setCreateError('Pick an agent first.');
      return;
    }
    if (!title.trim() || !prompt.trim() || !schedule.trim()) {
      setCreateError('Title, prompt, and schedule are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // For "once" or interval schedules, fire immediately. For daily/weekly,
      // the runner computes the first occurrence after now.
      const nextRunAt = Timestamp.now();
      await addDoc(collection(db, 'goals'), {
        ownerId: user.uid,
        agentId: activeAgentId,
        title: title.trim(),
        prompt: prompt.trim(),
        schedule: schedule.trim(),
        timezone: timezone.trim() || browserTimezone,
        status: 'active' as GoalStatus,
        nextRunAt,
        runCount: 0,
        errorCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: 'user',
      });
      setTitle('');
      setPrompt('');
      setSchedule('every 1h');
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handlePauseResume(goal: Goal) {
    const next: GoalStatus = goal.status === 'active' ? 'paused' : 'active';
    await updateDoc(doc(db, 'goals', goal.id), {
      status: next,
      updatedAt: Timestamp.now(),
      ...(next === 'active' && goal.nextRunAt.toMillis() < Date.now()
        ? { nextRunAt: Timestamp.now() }
        : {}),
    });
  }

  async function handleRunNow(goal: Goal) {
    if (goal.status !== 'active') return;
    await updateDoc(doc(db, 'goals', goal.id), {
      nextRunAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  async function handleDelete(goal: Goal) {
    if (!confirm(`Delete "${goal.title}"? This stops future runs and removes run history.`)) return;
    await deleteDoc(doc(db, 'goals', goal.id));
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-100">
            <Zap className="h-6 w-6 text-orange-400" />
            Auto-pilot Goals
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Schedule your agents to run on their own — every N minutes, daily at a time, or once.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? 'Close' : 'New goal'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
                Title
                <HelpTooltip text="Short label so you can recognize this goal in the list." />
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Morning email triage"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
                Agent
                <HelpTooltip text="Which agent should run this. Inherits its tools, memory, and system prompt." />
              </label>
              <select
                value={activeAgentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500/50 focus:outline-none"
              >
                {agents.length === 0 && <option value="">No agents — create one first</option>}
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
                Schedule
                <HelpTooltip text="Examples: 'every 30m', 'every 2h', 'daily 08:30', 'weekly Mon 09:00', 'once'. Daily/weekly times use the timezone below." />
              </label>
              <div className="flex gap-2">
                <input
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
                />
                <select
                  value=""
                  onChange={(e) => e.target.value && setSchedule(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 focus:border-orange-500/50 focus:outline-none"
                  title="Presets"
                >
                  <option value="">Presets…</option>
                  {SCHEDULE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
                Timezone
                <HelpTooltip text="Used for daily/weekly schedules. Defaults to your browser's timezone. Intervals like 'every 30m' ignore this." />
              </label>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder={browserTimezone}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-400">
                Prompt
                <HelpTooltip text="What the agent should do each time the goal fires. Be specific." />
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Read my Apple Mail inbox, find any urgent emails from the last 24 hours, and summarize them."
                rows={4}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          {createError && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {createError}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create goal
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const badge = statusBadge(goal.status);
            const agent = agents.find((a) => a.id === goal.agentId);
            return (
              <div
                key={goal.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-zinc-100">{goal.title}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-zinc-400">{goal.prompt}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        {agent?.name ?? 'Unknown agent'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {goal.schedule}{goal.timezone ? ` · ${goal.timezone}` : ''}
                      </span>
                      <span>
                        Next: {goal.status === 'active' ? formatTimestamp(goal.nextRunAt) : '—'}
                      </span>
                      <span>
                        Runs: {goal.runCount ?? 0}
                        {goal.errorCount ? ` (${goal.errorCount} errors)` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {goal.status !== 'completed' && goal.status !== 'error' && (
                      <button
                        onClick={() => handleRunNow(goal)}
                        disabled={goal.status !== 'active'}
                        title="Run now"
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-orange-400 disabled:opacity-30"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                    {(goal.status === 'active' || goal.status === 'paused') && (
                      <button
                        onClick={() => handlePauseResume(goal)}
                        title={goal.status === 'active' ? 'Pause' : 'Resume'}
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        {goal.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(goal)}
                      title="Delete"
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {goal.lastResult && (
                  <div className="mt-4 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      {goal.lastResult.error ? (
                        <AlertTriangle className="h-3 w-3 text-red-400" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      )}
                      Last run · {formatTimestamp(goal.lastResult.finishedAt)}
                    </div>
                    <p className="text-xs text-zinc-400">
                      {goal.lastResult.error || goal.lastResult.summary || 'No output.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center">
      <Zap className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
      <h3 className="mb-1 text-base font-semibold text-zinc-200">No auto-pilot goals yet</h3>
      <p className="mx-auto mb-5 max-w-md text-sm text-zinc-500">
        Create a goal and your agent will run it on a schedule — even when you&apos;re asleep.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
      >
        <Plus className="h-4 w-4" />
        Create your first goal
      </button>
    </div>
  );
}
