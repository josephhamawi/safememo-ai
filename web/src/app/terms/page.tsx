import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service — Noomachy',
  description:
    'The terms and conditions governing your use of the Noomachy AI agent platform.',
  alternates: { canonical: 'https://noomachy.com/terms' },
  openGraph: {
    title: 'Terms of Service — Noomachy',
    description: 'The terms and conditions governing your use of Noomachy.',
    url: 'https://noomachy.com/terms',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">Noomachy</span>
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

        <h1 className="mb-4 text-4xl font-bold">Terms of Service</h1>
        <p className="mb-12 text-sm text-zinc-500">Last updated: April 11, 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using Noomachy (the &ldquo;Service&rdquo;), you agree to be
              bound by these Terms of Service and our{' '}
              <Link href="/privacy" className="text-orange-400 underline underline-offset-2">
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">2. Description of Service</h2>
            <p>
              Noomachy is an AI agent platform that lets users create personal AI assistants
              with sovereign memory, tool use, and multi-channel deployment. The Service is
              provided on an &ldquo;as-is&rdquo; basis and may evolve over time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">3. Account Eligibility</h2>
            <p>
              You must be at least 13 years old to use Noomachy. By creating an account, you
              represent that you meet this age requirement and that the information you provide
              is accurate and complete.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">4. Acceptable Use</h2>
            <p>You agree NOT to use the Service to:</p>
            <ul className="ml-6 mt-2 list-disc space-y-2">
              <li>Generate or distribute illegal, harmful, or hateful content</li>
              <li>Attempt to bypass security measures or rate limits</li>
              <li>Reverse engineer, decompile, or disassemble the Service</li>
              <li>Use the Service to spam, phish, or distribute malware</li>
              <li>Train competing AI models on Service outputs</li>
              <li>Impersonate others or misrepresent your identity</li>
              <li>Violate any applicable laws or third-party rights</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">5. User Content and Data</h2>
            <p>
              You retain ownership of all content you create or upload (&ldquo;User
              Content&rdquo;). By using the Service, you grant Noomachy a limited license to
              process your User Content solely for the purpose of providing the Service to you.
            </p>
            <p className="mt-3">
              We do <strong>not</strong> use your conversations, memories, or other User
              Content to train AI models, and we do <strong>not</strong> share your User
              Content with third parties except as required to deliver the Service (e.g.,
              sending prompts to AI model providers like Anthropic and Google).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">6. AI-Generated Content</h2>
            <p>
              The Service uses third-party AI models to generate responses. AI outputs may be
              inaccurate, outdated, or biased. You are responsible for verifying the accuracy
              of any AI-generated content before relying on it for important decisions.
            </p>
            <p className="mt-3">
              Noomachy makes no warranty regarding the accuracy, reliability, or
              fitness-for-purpose of AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">7. Plans and Billing</h2>
            <p>
              Noomachy offers free and paid plans. Free plans are subject to usage limits.
              Paid plans are billed monthly or annually in advance. You can cancel at any
              time, with cancellations taking effect at the end of the current billing cycle.
              Refunds are evaluated on a case-by-case basis.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">8. Third-Party Services</h2>
            <p>
              The Service integrates with third parties including Anthropic (Claude), Google
              (Gemini, Firebase), and any custom MCP servers you configure. Your use of these
              integrations is also governed by their respective terms and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">9. Termination</h2>
            <p>
              You may delete your account at any time from the Settings page. We may suspend
              or terminate accounts that violate these Terms, with or without notice. On
              termination, your data will be deleted within 30 days, except where retention is
              required by law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">10. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
              WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION
              ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
              NON-INFRINGEMENT. NOOMACHY DOES NOT WARRANT THAT THE SERVICE WILL BE
              UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, NOOMACHY AND ITS AFFILIATES SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES
              ARISING OUT OF YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM SHALL
              NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be announced
              via email or in-app notification. Continued use of the Service after changes
              take effect constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">13. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction where Noomachy is
              incorporated, without regard to conflict-of-law principles. Disputes shall be
              resolved in the courts of that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-bold text-zinc-100">14. Contact</h2>
            <p>
              Questions about these Terms? Email us at{' '}
              <a
                href="mailto:hello@kodefoundry.com"
                className="text-orange-400 underline underline-offset-2"
              >
                hello@kodefoundry.com
              </a>
              .
            </p>
          </section>
        </div>
      </article>

      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Noomachy
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
