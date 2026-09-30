'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bot, Loader2, Lock, Mail, User } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

type Mode = 'signin' | 'signup';

/**
 * Email and password only.
 *
 * Google and GitHub sign-in went with Firebase Auth — those buttons were
 * Firebase OAuth providers, not something this server can offer on its own.
 * Re-adding social login means implementing OAuth against each provider
 * directly; it is not a missing wire-up.
 */
export default function LoginPage() {
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const result =
        mode === 'signup'
          ? await signUpWithEmail(email, password, displayName || undefined)
          : await signInWithEmail(email, password);

      toast({
        type: 'success',
        title: mode === 'signup' ? 'Account created' : 'Welcome back',
        message:
          result.needsApiKey
            ? 'Next: connect your AI provider.'
            : 'You are signed in.',
      });

      // A new account has no provider key yet, and nothing works without one,
      // so setup comes before the dashboard.
      router.push(result.needsApiKey ? '/onboarding/api-key' : '/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isSignup = mode === 'signup';

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <h1 className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              SafeMemo AI
            </h1>
          </div>
          <p className="text-sm text-zinc-500">
            {isSignup ? 'Create your workspace' : 'Sign in to your workspace'}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-black/50">
          {error && (
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <fieldset disabled={submitting} className="space-y-4">
              {isSignup && (
                <Field
                  id="name"
                  label="Name"
                  icon={User}
                  type="text"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
              )}

              <Field
                id="email"
                label="Email"
                icon={Mail}
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />

              <div>
                <Field
                  id="password"
                  label="Password"
                  icon={Lock}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••••••"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  minLength={isSignup ? 12 : undefined}
                />
                {isSignup && (
                  <p className="mt-1.5 text-xs text-zinc-600">
                    At least 12 characters. Length matters more than symbols.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!email || !password || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSignup ? (
                  'Create account'
                ) : (
                  'Sign in'
                )}
              </button>
            </fieldset>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-500">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError(null);
              }}
              className="font-medium text-orange-400 hover:text-orange-300"
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By continuing you agree to our{' '}
          <Link href="/terms" className="text-zinc-500 hover:text-zinc-400">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-zinc-500 hover:text-zinc-400">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  icon: Icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
}: {
  id: string;
  label: string;
  icon: React.ElementType;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500"
      >
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          className="w-full rounded-md border border-zinc-800 bg-black py-2.5 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-700 outline-none focus:border-zinc-600"
        />
      </div>
    </div>
  );
}
