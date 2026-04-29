import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/content/blog/posts';
import { Bot, Calendar, Clock, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog — Noomachy AI Agent Platform',
  description:
    'Learn about AI agents, sovereign memory, the Model Context Protocol, and how to build personal AI assistants that actually remember you.',
  openGraph: {
    title: 'Noomachy Blog — AI Agents, Memory, and the Future of Personal AI',
    description:
      'In-depth guides on AI agents, sovereign memory, MCP tooling, and building personal AI assistants.',
    url: 'https://noomachy.com/blog',
    siteName: 'Noomachy',
    images: [{ url: '/og-image.png', width: 659, height: 659 }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Noomachy Blog',
    description: 'AI agents, sovereign memory, and the Model Context Protocol.',
    images: ['/og-image.png'],
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  'AI Agents': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  Memory: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Tools: 'bg-green-500/10 text-green-400 border-green-500/20',
  Tutorials: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Comparisons: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Privacy: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function BlogIndex() {
  const sorted = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));

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
          <div className="hidden items-center gap-8 md:flex">
            <Link href="/#features" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
              Features
            </Link>
            <Link href="/#pricing" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
              Pricing
            </Link>
            <Link href="/blog" className="text-sm text-orange-400">
              Blog
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-zinc-200">
              Sign In
            </Link>
            <Link
              href="/auth/login?tab=signup"
              className="rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h1 className="mb-4 text-4xl font-bold md:text-5xl">
          The{' '}
          <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
            Noomachy
          </span>{' '}
          Blog
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-zinc-400">
          In-depth guides on AI agents, sovereign memory, and the future of personal AI.
        </p>
      </section>

      {/* Posts grid */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-6 transition-all hover:border-orange-500/40 hover:bg-zinc-900"
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                    CATEGORY_COLORS[post.category] || 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  {post.category}
                </span>
              </div>
              <h2 className="mb-2 text-lg font-semibold text-zinc-100 transition-colors group-hover:text-orange-400">
                {post.title}
              </h2>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-zinc-400 line-clamp-3">
                {post.description}
              </p>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(post.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {post.readTime}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-zinc-800/50 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-bold">Ready to build with sovereign AI?</h2>
          <p className="mb-6 text-zinc-400">
            Create your first AI agent in under a minute. Free tier, no credit card.
          </p>
          <Link
            href="/auth/login?tab=signup"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Bot className="h-4 w-4" />
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
