'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Loader2,
  ShieldCheck,
  Lock,
  Trash2,
  ScrollText,
  GitBranch,
  AlertCircle,
  ArrowRight,
  Check,
} from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">Noomachy</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#how" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">How it works</a>
            <a href="#demo" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">Demo</a>
            <a href="#trust" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">Trust</a>
            <Link href="/blog" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">Blog</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
              Sign in
            </Link>
            <a
              href="#early-access"
              className="rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Request early access
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(234,88,12,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-1.5 text-xs text-zinc-400">
            <ShieldCheck className="h-3 w-3 text-orange-400" />
            For compliance-bound legal, healthcare, and finance teams
          </div>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Tamper-proof memory for{' '}
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
              compliance-bound AI agents
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-400 md:text-xl">
            The only agent memory layer with human-in-the-loop fact validation,
            SHA-256 hash-chained audit trails, and tenant isolation by default.
            Designed so every fact your agent recalls can be defended in a deposition.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#early-access"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30 hover:opacity-95"
            >
              Request early access
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#demo"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-8 py-3.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              See the demo
            </a>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section id="trust" className="border-t border-zinc-800/50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              What you get on day one
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TrustBadge
              icon={ScrollText}
              title="Tamper-evident audit log"
              detail="Every memory write, approval, and rejection is SHA-256 hash-chained. Modify any earlier entry and every later hash breaks."
            />
            <TrustBadge
              icon={Lock}
              title="Tenant-isolated, encrypted at rest"
              detail="Firestore-native multi-tenant isolation enforced in security rules. Encryption at rest is on by default for every customer."
            />
            <TrustBadge
              icon={Trash2}
              title="Right-to-erasure: TTL + manual purge"
              detail="Working memory expires automatically. Semantic memory has a one-click purge that records the deletion in the audit chain."
            />
          </div>
          <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-zinc-600">
            Noomachy ships the technical controls compliance teams ask for.
            We are not certified — certification depends on your specific
            deployment. We give you the substrate; your auditor signs off.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-zinc-800/50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              The validation gate
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-400">
              No fact reaches your agent's long-term memory without passing through
              a human-reviewable queue. Duplicates, contradictions, and low-confidence
              extractions are flagged automatically.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Step
              n={1}
              icon={GitBranch}
              title="Agent proposes a fact"
              description="During a conversation, the agent extracts a candidate memory and writes it to a staging queue. Nothing is committed yet."
            />
            <Step
              n={2}
              icon={AlertCircle}
              title="Validation gate runs"
              description="Cosine-similarity dedup, contradiction detection on shared-tag conflicts, plain-English explanations for the reviewer."
            />
            <Step
              n={3}
              icon={ShieldCheck}
              title="Human approves or rejects"
              description="Decision is recorded to the SHA-256 hash chain alongside the reviewer ID, timestamp, and reasoning. Auditable forever."
            />
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="border-t border-zinc-800/50 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Demo: Legal contract review agent
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-400">
              An associate uploads a precedent. The agent extracts five facts.
              One contradicts a prior matter. Watch the validation gate catch it,
              and watch the audit log record the decision.
            </p>
          </div>
          <ol className="space-y-4">
            <DemoStep
              n="01"
              title="Agent extracts 5 candidate facts from the contract"
              detail='Including: "Termination notice period is 60 days." Staged, not yet committed.'
            />
            <DemoStep
              n="02"
              title="Validation gate flags one contradiction"
              detail='Plain English: "This memory conflicts with: \"Termination notice period is 30 days for Acme matters\" (84% similar, both tagged termination, contract). Approve only if both can be true at once."'
              warning
            />
            <DemoStep
              n="03"
              title="Reviewer approves four, rejects one with a written reason"
              detail="Each decision writes a new entry into the per-memory hash chain. Reviewer ID, timestamp, and rationale are sealed."
            />
            <DemoStep
              n="04"
              title="Outside counsel asks: 'how did you arrive at this position?'"
              detail='You click "Share audit trail," send a 7-day signed link. They see the SHA-256 chain, validate it cryptographically, and verify the lineage end-to-end.'
              highlight
            />
          </ol>
        </div>
      </section>

      {/* Early access */}
      <section id="early-access" className="border-t border-zinc-800/50 px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Request early access
            </h2>
            <p className="text-zinc-400">
              We are onboarding a small cohort of design partners now. Tell us
              what you'd use it for and we will reply within two business days.
            </p>
          </div>
          <EarlyAccessForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <ShieldCheck className="h-4 w-4" />
            Noomachy
          </div>
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} Noomachy. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function TrustBadge({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
        <Icon className="h-4 w-4 text-orange-400" />
      </div>
      <h3 className="mb-1.5 text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-500">{detail}</p>
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  description,
}: {
  n: number;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-500">
          0{n}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
          <Icon className="h-4 w-4 text-orange-400" />
        </div>
      </div>
      <h3 className="mb-2 text-base font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-500">{description}</p>
    </div>
  );
}

function DemoStep({
  n,
  title,
  detail,
  warning,
  highlight,
}: {
  n: string;
  title: string;
  detail: string;
  warning?: boolean;
  highlight?: boolean;
}) {
  const ringClass = warning
    ? 'border-yellow-500/30 bg-yellow-500/5'
    : highlight
    ? 'border-orange-500/30 bg-orange-500/5'
    : 'border-zinc-800 bg-zinc-950';
  return (
    <li className={`flex gap-4 rounded-xl border p-5 ${ringClass}`}>
      <span className="font-mono text-xs text-zinc-600">{n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-sm font-semibold text-zinc-100">{title}</h3>
        <p className="text-sm leading-relaxed text-zinc-400">{detail}</p>
      </div>
    </li>
  );
}

function EarlyAccessForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'earlyAccessRequests'), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        organization: organization.trim(),
        useCase: useCase.trim(),
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-6 text-center">
        <Check className="mx-auto mb-3 h-8 w-8 text-orange-400" />
        <p className="font-medium text-zinc-100">Got it. We'll reply within two business days.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-800 bg-zinc-950 p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Name" value={name} onChange={setName} />
        <Input
          label="Work email"
          type="email"
          required
          value={email}
          onChange={setEmail}
        />
      </div>
      <div className="mt-4">
        <Input
          label="Organization"
          value={organization}
          onChange={setOrganization}
        />
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">
          What would you use it for?
        </label>
        <textarea
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          rows={3}
          placeholder="e.g. contract review with audit trails for outside counsel"
          className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
        />
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={submitting || !email}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Request early access
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

function Input({
  label,
  type = 'text',
  required,
  value,
  onChange,
}: {
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-zinc-500">
        {label}
        {required && <span className="ml-0.5 text-orange-400">*</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
      />
    </div>
  );
}
