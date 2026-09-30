import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Bot, Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms — SafeMemo AI',
  description:
    'SafeMemo AI is AGPL-3.0 open-source software. The software is covered by its licence; use of this instance is governed by whoever operates it.',
  openGraph: {
    title: 'Terms — SafeMemo AI',
    description:
      'AGPL-3.0 open-source software. Licence terms, and what the operator of this instance is responsible for.',
  },
};

/**
 * Terms page for a self-hosted, open-source deployment.
 *
 * The previous version was a SaaS terms-of-service: account rules, plan
 * tiers, a governing-law clause. None of that applies to software the project
 * gives away and does not operate. What replaces it is the licence that
 * actually governs the code, plus a clear statement that the operator of this
 * instance — not the authors — sets the terms of using it.
 */
export default function TermsPage() {
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

        <h1 className="mb-4 text-4xl font-bold">Terms</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Covering the software. Use of this instance is governed by its operator.
        </p>

        <div className="mb-10 rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
            <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
              <p className="font-semibold text-zinc-100">
                Two different agreements are at work here.
              </p>
              <p>
                The <strong className="text-zinc-200">software</strong> is
                licensed to you under the GNU AGPL v3. That licence, and nothing
                on this page, is what governs the code. Your{' '}
                <strong className="text-zinc-200">use of this particular
                installation</strong> is a matter between you and whoever runs
                it — the project authors are not party to it.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-zinc-300">
          <Section title="Licence">
            <p>
              SafeMemo AI is free software under the{' '}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noreferrer noopener"
                className="text-orange-400 hover:text-orange-300"
              >
                GNU Affero General Public License, version 3
              </a>
              . You may run it, study it, modify it, and redistribute it.
            </p>
            <p>
              The obligation worth knowing about: if you modify the software and
              make it available to others over a network, the AGPL requires you
              to offer those users the corresponding source of your modified
              version. Running an unmodified copy for yourself carries no such
              duty.
            </p>
            <p>
              The full licence text ships with the source as{' '}
              <code className="rounded bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300">
                LICENSE
              </code>
              . Where this page and the licence differ, the licence wins.
            </p>
          </Section>

          <Section title="No warranty">
            <p>
              The software is provided <strong className="text-zinc-200">as
              is, without warranty of any kind</strong>, as set out in sections
              15 and 16 of the AGPL. Nobody guarantees it is fit for your
              purpose, free of defects, or that it will keep running. If it
              breaks, you keep both pieces.
            </p>
            <p>
              This matters more than usual for a product about audit trails. The
              hash chain is tamper-<em>evident</em>: it lets you detect that
              records were altered. It does not prevent alteration by someone
              with database access, and it is not a certification of anything.
              Whether this deployment satisfies an obligation you are under is a
              question for you and your advisers, not for the software.
            </p>
          </Section>

          <Section title="Your AI provider">
            <p>
              You supply your own API key for Anthropic, Google, or OpenAI. That
              relationship is directly between you and them: you are bound by
              their terms, you are billed by them, and their policies govern how
              they handle the conversation content sent under your key.
            </p>
            <p>
              Neither this software nor its authors are a party to that
              arrangement, take a cut of it, or can see what you spend.
            </p>
          </Section>

          <Section title="What you are responsible for">
            <ul className="ml-4 list-disc space-y-1.5">
              <li>Keeping your own account credentials and API key secure.</li>
              <li>
                Having the right to put into the system whatever you put into
                it, including anyone else&apos;s personal or confidential
                information.
              </li>
              <li>
                Complying with the law that applies to you, and with your AI
                provider&apos;s acceptable-use terms.
              </li>
              <li>
                Reviewing what the agent proposes. The validation queue exists
                because the model can be wrong; approving a fact is your
                judgement, recorded under your name.
              </li>
            </ul>
          </Section>

          <Section title="If you are the operator">
            <p>
              Running this instance for other people makes you responsible to
              them. You control the server, the database, backups, and access.
              You decide retention, and you answer data-protection requests.
            </p>
            <p>
              Two obligations are easy to overlook.{' '}
              <strong className="text-zinc-200">
                Back up MASTER_ENCRYPTION_KEY separately from the database
              </strong>{' '}
              — losing it makes every stored credential permanently unreadable,
              and leaking it alongside a database dump exposes all of them.
              And if you modify the software for a service others use over a
              network, the AGPL obliges you to publish your changes.
            </p>
          </Section>

          <Section title="Trade marks">
            <p>
              The AGPL covers the code, not the name. It does not grant
              permission to present a modified version as the official SafeMemo
              AI, or to use the name in a way that suggests endorsement.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              This page ships with the software and changes when the code
              changes; the history is public in the repository. An operator may
              replace it with terms of their own, which would then govern your
              use of their instance alongside the software licence.
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
