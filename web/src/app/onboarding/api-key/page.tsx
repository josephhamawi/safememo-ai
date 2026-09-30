'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';

import {
  ApiError,
  type Provider,
  type ProviderId,
  credentials,
} from '@/lib/api';

/**
 * First stop after sign-up: the user supplies their own model provider key.
 *
 * SafeMemo AI holds no shared API key, so nothing works until this is done —
 * which is why this screen has no skip. The key is verified against the
 * provider before it is stored, so the user finds out here rather than on
 * their first message.
 */
export default function ApiKeySetupPage() {
  const router = useRouter();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState<ProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    credentials
      .providers()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load the provider list. Is the API running?');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const provider = providers.find((p) => p.id === selected);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || saving) return;

    setSaving(true);
    setError(null);

    try {
      await credentials.save({ provider: selected, apiKey: apiKey.trim() });
      // Drop the plaintext from component state the moment it is stored.
      setApiKey('');
      setSaved(true);
      router.replace('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong saving that key.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <div className="text-center">
          <Check className="mx-auto mb-4 h-10 w-10 text-orange-400" />
          <p className="text-zinc-300">Key verified. Taking you to your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-6 py-16 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <h1 className="mb-3 text-2xl font-bold">Connect your AI provider</h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            SafeMemo AI runs on your own model account, so you pay your provider
            directly and your prompts are never billed through anyone else.
            Add a key to get started.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-800 bg-zinc-950 p-6"
        >
          <fieldset disabled={saving} className="space-y-5">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-zinc-500">
                Provider
              </label>
              <div className="grid gap-2">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelected(p.id);
                      setError(null);
                    }}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                      selected === p.id
                        ? 'border-orange-500/50 bg-orange-500/5 text-zinc-100'
                        : 'border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <span className="font-medium">{p.label}</span>
                    {selected === p.id && (
                      <Check className="h-4 w-4 text-orange-400" />
                    )}
                  </button>
                ))}
                {providers.length === 0 && (
                  <div className="rounded-lg border border-zinc-800 px-4 py-3 text-sm text-zinc-600">
                    Loading providers…
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="api-key"
                  className="text-xs uppercase tracking-wider text-zinc-500"
                >
                  API key
                </label>
                {provider && (
                  <a
                    href={provider.consoleUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300"
                  >
                    Get a key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="relative">
                <input
                  id="api-key"
                  // Password-typed so it is masked, excluded from autofill
                  // heuristics, and kept out of browser form history.
                  type={revealed ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError(null);
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore
                  placeholder={provider?.formatHint ?? ''}
                  className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2.5 pr-10 font-mono text-sm text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  aria-label={revealed ? 'Hide key' : 'Show key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-400"
                >
                  {revealed ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-xs leading-relaxed text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!apiKey.trim() || saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying with {provider?.label ?? 'provider'}…
                </>
              ) : (
                <>
                  Verify and save
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </fieldset>
        </form>

        <div className="mt-6 flex gap-3 rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
          <div className="space-y-1.5 text-xs leading-relaxed text-zinc-500">
            <p>
              Your key is encrypted with AES-256-GCM before it touches the
              database, under a master key that lives only in this server&apos;s
              environment.
            </p>
            <p>
              There is no endpoint that can read it back — not for you, not for
              an administrator. You can replace or delete it at any time, and
              only the last four characters are ever displayed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
