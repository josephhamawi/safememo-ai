'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertCircle,
  Hash,
  Share2,
  Copy,
  Check,
} from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  status: 'success' | 'error';
  timestamp: Timestamp | null;
  previousChainHash: string | null;
  chainHash: string;
  resultHash: string;
}

export default function AuthedAuditTrailPage({
  params,
}: {
  params: Promise<{ agentId: string; memoryId: string }>;
}) {
  const { agentId, memoryId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [chainOk, setChainOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setError('Sign in to view this audit trail.');
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'auditLogs'),
      where('userId', '==', user.uid),
      where('memoryId', '==', memoryId),
      orderBy('timestamp', 'asc'),
      limit(500),
    );

    (async () => {
      try {
        const snap = await getDocs(q);
        const items: AuditEntry[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            action: data.action,
            status: data.status,
            timestamp: data.timestamp ?? null,
            previousChainHash: data.previousChainHash ?? null,
            chainHash: data.chainHash,
            resultHash: data.resultHash,
          };
        });
        setEntries(items);

        // Verify chain integrity locally using the Web Crypto API
        let ok = true;
        for (let i = 0; i < items.length; i++) {
          const e = items[i];
          const prev = i === 0 ? null : items[i - 1].chainHash;
          const expected = await sha256Hex((prev ?? '') + ':' + (e.resultHash ?? ''));
          if (e.chainHash !== expected) {
            ok = false;
            break;
          }
        }
        setChainOk(ok);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
  }, [user, authLoading, memoryId]);

  // Browser SHA-256 helper. Lives inline because the verification is the
  // entire point of this page — should never need to import a polyfill.

  const handleShare = async () => {
    setSharing(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const mintFn = httpsCallable<
        { agentId: string; memoryId: string; ttlDays?: number },
        { token: string; expiresAt: number }
      >(functions, 'mintAuditShareToken');
      const res = await mintFn({ agentId, memoryId, ttlDays: 7 });
      const url = `${window.location.origin}/audit/share?token=${encodeURIComponent(res.data.token)}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard may not be available
      }
    } catch (err) {
      console.error('Failed to mint share token', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800/50 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Link
            href="/dashboard/memory"
            className="flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to memory
          </Link>
          <span className="text-zinc-700">|</span>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-400" />
            <h1 className="text-sm font-semibold">Audit trail</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Memory</p>
            <p className="mt-0.5 font-mono text-sm text-zinc-200">{memoryId}</p>
          </div>
          <div className="flex items-center gap-2">
            {!loading && entries.length > 0 && (
              <ChainStatus ok={chainOk} />
            )}
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
            >
              {sharing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              Share signed link
            </button>
          </div>
        </div>

        {shareUrl && (
          <div className="mb-6 rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs uppercase tracking-wider text-orange-300">
                Shareable link (7-day expiry)
              </p>
              {copied && (
                <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                  <Check className="h-3 w-3" />
                  Copied
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-300 outline-none"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="rounded border border-zinc-800 bg-zinc-900 px-2 text-zinc-400 hover:bg-zinc-800"
                title="Copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

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

        {!loading && !error && entries.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-8 text-center text-sm text-zinc-500">
            No audit entries yet for this memory. Approving or rejecting it
            will start the chain.
          </div>
        )}

        <ol className="space-y-3">
          {entries.map((entry, idx) => (
            <li
              key={entry.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                    #{idx + 1}
                  </span>
                  <span className="text-sm font-medium text-zinc-200">
                    {humanizeAction(entry.action)}
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
                    {entry.timestamp.toDate().toUTCString()}
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
      </main>
    </div>
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
        className={`truncate ${highlight ? 'text-orange-300' : 'text-zinc-500'}`}
        title={value ?? ''}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function humanizeAction(action: string): string {
  if (action.startsWith('memory_')) {
    return 'Memory ' + action.slice('memory_'.length).replace('_', ' ');
  }
  return action.replace(/_/g, ' ');
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
