'use client';

import { audit as auditApi } from '@/lib/api';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Loader2, AlertCircle, Hash } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  status: string;
  /** ISO-8601 from the API (Firestore sent epoch millis). */
  timestamp: string | null;
  previousChainHash: string | null;
  chainHash: string;
  resultHash: string | null;
}

interface AuditResponse {
  memoryId: string;
  chainOk: boolean;
  entryCount: number;
  entries: AuditEntry[];
}

function AuditSharePageInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('No share token provided.');
      setLoading(false);
      return;
    }

    // Public endpoint: the token is the only credential, so no session is
    // sent. Verification runs server-side against the stored hashes.
    auditApi
      .viewShared(token)
      .then((res) => {
        setData({
          memoryId: res.chainKey,
          chainOk: res.verification.valid,
          entryCount: res.verification.entries,
          entries: res.entries.map((e) => ({
            id: e.id,
            action: e.action,
            status: (e.payload?.status as string) ?? 'recorded',
            timestamp: e.createdAt,
            previousChainHash: e.prevHash,
            chainHash: e.entryHash,
            resultHash: (e.payload?.resultHash as string) ?? null,
          })) as AuditEntry[],
        });
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800/50 px-6 py-5">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-orange-400" />
          <h1 className="text-lg font-semibold">Memory audit trail</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-6">
            <div className="mb-2 flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Could not load audit trail</span>
            </div>
            <p className="text-sm text-zinc-400">{error}</p>
          </div>
        )}

        {data && !loading && (
          <>
            <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Memory ID
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-zinc-200">
                    {data.memoryId}
                  </p>
                </div>
                <ChainStatus ok={data.chainOk} />
              </div>
              <p className="text-xs text-zinc-500">
                {data.entryCount} entries in this chain. Each chain hash is
                SHA-256 of the previous hash concatenated with the entry result
                hash. Changing any earlier entry invalidates every later one.
              </p>
            </div>

            <ol className="space-y-3">
              {data.entries.map((entry, idx) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-medium text-zinc-200">
                        {entry.action}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] capitalize ${
                          entry.status === 'success'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                    {entry.timestamp && (
                      <span className="text-xs text-zinc-500">
                        {new Date(entry.timestamp).toUTCString()}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1 text-[11px] text-zinc-500">
                    <HashRow label="prev" value={entry.previousChainHash} />
                    <HashRow label="result" value={entry.resultHash} />
                    <HashRow label="chain" value={entry.chainHash} highlight />
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}

export default function AuditSharePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      }
    >
      <AuditSharePageInner />
    </Suspense>
  );
}

function ChainStatus({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs text-green-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Chain intact
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-400">
      <ShieldAlert className="h-3.5 w-3.5" />
      Chain broken
    </span>
  );
}

function HashRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | null;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 font-mono">
      <Hash className="h-2.5 w-2.5 shrink-0 text-zinc-700" />
      <span className="w-12 shrink-0 uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      <span
        className={`truncate ${
          highlight ? 'text-orange-300' : 'text-zinc-500'
        }`}
        title={value ?? ''}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}
