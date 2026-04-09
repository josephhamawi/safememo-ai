'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Bot, Brain, MessageSquare, Wrench, Users, Zap, Shield, ArrowRight, Check } from 'lucide-react';
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
      <div className="flex h-screen items-center justify-center bg-[#09090b]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">Noomachy</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">Features</a>
            <a href="#pricing" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">Pricing</a>
            <a href="#about" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">About</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
              Sign In
            </Link>
            <Link
              href="/auth/login?tab=signup"
              className="rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(234,88,12,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-1.5 text-xs text-zinc-400">
            <Zap className="h-3 w-3 text-orange-400" />
            AI agents that actually remember
          </div>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            AI Agents with{' '}
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
              Sovereign Memory
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-400 md:text-xl">
            Build intelligent agents that learn from every conversation, remember context across sessions,
            and use tools autonomously. Three-layer memory architecture ensures nothing important is ever forgotten.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/login?tab=signup"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30 hover:opacity-95"
            >
              Start Building Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#features"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-8 py-3.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-zinc-800/50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Everything you need for intelligent agents</h2>
            <p className="mx-auto max-w-2xl text-zinc-400">
              From sovereign memory to multi-channel deployment, Noomachy gives your agents the tools to truly learn and adapt.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <FeatureCard
              icon={Brain}
              title="Three-Layer Sovereign Memory"
              description="Working memory for active sessions, semantic memory with human-in-the-loop validation, and episodic decision logs that auto-consolidate into long-term knowledge."
            />
            <FeatureCard
              icon={MessageSquare}
              title="Multi-Channel Support"
              description="Deploy agents across Telegram, Discord, Slack, WhatsApp, and web. One agent, everywhere your users are, with consistent context."
            />
            <FeatureCard
              icon={Wrench}
              title="MCP Skill System"
              description="Extend agents with sandboxed skills via the Model Context Protocol. File operations, web search, code execution, and custom tools with granular permissions."
            />
            <FeatureCard
              icon={Users}
              title="Real-Time Collaborative UI"
              description="See who's online, watch conversations unfold live, explore memory graphs, and manage the validation queue together."
            />
            <FeatureCard
              icon={Shield}
              title="Enterprise Security"
              description="Multi-tenant isolation, tamper-proof audit logs, sandboxed skill execution, and Firestore security rules that enforce the validation gate."
            />
            <FeatureCard
              icon={Zap}
              title="Vector Search & Embeddings"
              description="Vertex AI-powered semantic search with 768-dimensional embeddings. Your agents find relevant memories instantly, not just recent ones."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-zinc-800/50 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Simple, transparent pricing</h2>
            <p className="text-zinc-400">Start free, scale when you need to.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <PricingCard
              name="Free"
              price="$0"
              description="Perfect for getting started"
              features={['3 agents', '100K tokens/month', 'Web channel', 'Community support', 'Basic memory']}
              cta="Get Started"
              href="/auth/login?tab=signup"
            />
            <PricingCard
              name="Pro"
              price="$29"
              description="For power users and small teams"
              features={['Unlimited agents', '2M tokens/month', 'All channels', 'Priority support', 'Full memory suite', 'Custom skills']}
              cta="Start Pro Trial"
              href="/auth/login?tab=signup"
              highlighted
            />
            <PricingCard
              name="Enterprise"
              price="Custom"
              description="For organizations at scale"
              features={['Unlimited everything', 'Custom token limits', 'Dedicated support', 'SSO & SAML', 'On-premise option', 'SLA guarantee']}
              cta="Contact Sales"
              href="/auth/login?tab=signup"
            />
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="border-t border-zinc-800/50 px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-bold md:text-4xl">Built for the future of AI</h2>
          <p className="mb-6 text-lg leading-relaxed text-zinc-400">
            Noomachy is an AI agent platform built on Firebase with a sovereign memory architecture.
            Unlike stateless chatbots, our agents maintain three layers of memory -- working, semantic,
            and episodic -- ensuring every interaction builds on the last. With a human-in-the-loop
            validation gate, you stay in control of what your agents learn.
          </p>
          <p className="text-zinc-500">
            Built with Next.js, Firebase, Claude, and the Model Context Protocol.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Bot className="h-4 w-4" />
            Noomachy
          </div>
          <p className="text-xs text-zinc-600">&copy; {new Date().getFullYear()} Noomachy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 transition-colors hover:border-zinc-700">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
        <Icon className="h-5 w-5 text-orange-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  description,
  features,
  cta,
  href,
  highlighted,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        highlighted
          ? 'border-orange-600 bg-zinc-950 shadow-lg shadow-orange-500/5'
          : 'border-zinc-800 bg-zinc-950'
      }`}
    >
      {highlighted && (
        <span className="mb-4 inline-block w-fit rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
          Most Popular
        </span>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-2 mb-1">
        <span className="text-3xl font-bold">{price}</span>
        {price !== 'Custom' && <span className="text-sm text-zinc-500">/month</span>}
      </div>
      <p className="mb-6 text-sm text-zinc-500">{description}</p>
      <ul className="mb-8 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
            <Check className="h-4 w-4 shrink-0 text-orange-400" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`block rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${
          highlighted
            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:opacity-90'
            : 'border border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
