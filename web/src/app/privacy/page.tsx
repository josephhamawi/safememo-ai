import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Bot, Database, Lock, Server, Shield, Trash2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy — SafeMemo AI',
  description:
    'SafeMemo AI is self-hosted open-source software. Whoever runs this instance controls the data; the project maintainers never receive it.',
  openGraph: {
    title: 'Privacy — SafeMemo AI',
    description:
      'Self-hosted open-source software. The operator of this instance controls the data.',
  },
};

/**
 * Privacy page for a self-hosted, open-source deployment.
 *
 * This is deliberately not a SaaS privacy policy. SafeMemo AI has no hosted
 * service and no central servers, so the project cannot make promises about
 * data it never receives. What it can do is state plainly what the software
 * does, what leaves the machine, and who is actually responsible — which is
 * whoever deployed this instance, not the authors of the code.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">SafeMemo AI</span>
          </Link>
          <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-zinc-200">
            Sign In
          </Link>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/auth/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>

        <h1 className="mb-4 text-4xl font-bold">Privacy</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Applies to this deployment of SafeMemo AI.
        </p>

        <div className="mb-10 rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
            <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
              <p className="font-semibold text-zinc-100">
                This is self-hosted software, not a service.
              </p>
              <p>
                SafeMemo AI is open-source software that someone installed on
                their own infrastructure. The people who wrote the code do not
                operate this instance, cannot access it, and never receive your
                data. Whoever deployed it is the party responsible for it, and
                the one to contact with questions about how they handle your
                information.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-12 grid gap-3 md:grid-cols-2">
          <Promise
            icon={Shield}
            title="No telemetry"
            detail="The software phones home to nobody. There is no analytics, no crash reporting, and no usage beacon."
          />
          <Promise
            icon={Lock}
            title="Your own model key"
            detail="You supply your own AI provider key. It is encrypted with AES-256-GCM and no endpoint can read it back."
          />
          <Promise
            icon={Database}
            title="One database, yours"
            detail="Everything is stored in the operator's own PostgreSQL database. There is no shared or multi-customer store."
          />
          <Promise
            icon={Trash2}
            title="Erasure that leaves evidence"
            detail="Purging a memory clears its content; the audit chain retains only the fact that a deletion happened."
          />
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-zinc-300">
          <Section title="What the software stores">
            <p>
              In the operator&apos;s database: your email address and an
              Argon2id hash of your password, the agents you create, your
              conversations and messages, memories that passed validation,
              audit-chain entries, and daily request counts.
            </p>
            <p>
              Your AI provider API key is stored encrypted. It is sealed under
              a per-credential key, which is itself sealed under a master key
              held only in the server&apos;s environment. No part of the
              application can return it to you or to an administrator; only its
              last four characters are ever displayed.
            </p>
            <p>
              Session tokens are stored as a SHA-256 hash rather than in the
              clear, so a copy of the database cannot be used to resume anyone&apos;s
              session.
            </p>
          </Section>

          <Section title="What leaves the machine">
            <p>
              Exactly one thing: the content of your conversations, sent to the
              AI provider whose key you supplied, so that it can generate a
              reply. That is Anthropic, Google, or OpenAI depending on your
              choice. Their handling of that data is governed by your own
              agreement with them, made under your own account.
            </p>
            <p>
              Nothing else is transmitted. By default, memory embeddings are
              generated on the machine itself by a local model, so the text of
              your memories is never sent anywhere for indexing. An operator can
              switch to a hosted embedding provider, in which case memory
              content is also sent there.
            </p>
            <p>
              If you create a share link for an audit trail, anyone holding that
              link can read that one chain until it expires or is revoked.
            </p>
          </Section>

          <Section title="Who can see your data">
            <p>
              Other users of this instance cannot. Every database query is
              scoped to the account that made the request, and stored
              credentials are cryptographically bound to their owner, so a
              credential row cannot be used under another account even if it
              were copied there.
            </p>
            <p>
              The operator of this instance has administrative access to the
              server and the database it runs on. That is inherent to
              self-hosting: they control the machine. They cannot read your
              provider API key, because the software provides no way to decrypt
              one for display, but they can read data stored in plaintext such
              as your messages and memories. Direct any questions about that to
              them.
            </p>
          </Section>

          <Section title="What you can do">
            <ul className="ml-4 list-disc space-y-1.5">
              <li>
                <strong className="text-zinc-200">Export everything</strong> —
                all memories as JSON, at any time.
              </li>
              <li>
                <strong className="text-zinc-200">Delete a memory</strong> — its
                content is cleared and its embedding removed.
              </li>
              <li>
                <strong className="text-zinc-200">Replace or remove your API key</strong>{' '}
                — removing it stops all model calls immediately.
              </li>
              <li>
                <strong className="text-zinc-200">Revoke a share link</strong> —
                individually, without affecting any other link.
              </li>
              <li>
                <strong className="text-zinc-200">Sign out everywhere</strong> —
                invalidates every session for your account.
              </li>
            </ul>
          </Section>

          <Section title="What this page cannot tell you">
            <p>
              Whether this operator keeps database backups and for how long,
              where the server is physically located, who on their side has
              access, and what they do if something goes wrong. Those are
              properties of the deployment, not of the software, and only the
              operator can answer them.
            </p>
            <p>
              If you are evaluating this instance for work that carries legal or
              regulatory obligations, ask them directly. The software provides
              the technical controls — tenant isolation, encryption at rest for
              credentials, a tamper-evident audit chain — but no software can
              certify a deployment it does not control.
            </p>
          </Section>

          <Section title="Children">
            <p>
              The software is not designed for children under 13 and the project
              does not knowingly collect their data. Age policy for this
              instance is set by its operator.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              This page ships with the software. It changes when the code
              changes, and the history is public in the repository. An operator
              may replace it with their own policy.
            </p>
          </Section>

          <Section title="The code">
            <p>
              Every claim here is checkable. The encryption is in{' '}
              <code className="rounded bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300">
                server/src/crypto/envelope.ts
              </code>
              , the audit chain in{' '}
              <code className="rounded bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300">
                server/src/lib/audit.ts
              </code>
              , and what the database holds in{' '}
              <code className="rounded bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300">
                server/src/db/migrations/
              </code>
              . Read them rather than taking this page&apos;s word for it.
            </p>
          </Section>
        </div>
      </article>

      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            SafeMemo AI
          </div>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-zinc-400">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-zinc-400">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Promise({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ElementType;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
      <div>
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        <p className="text-xs leading-relaxed text-zinc-400">{detail}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}
