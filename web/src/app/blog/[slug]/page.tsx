import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POSTS } from '@/content/blog/posts';
import { renderMarkdown } from '@/content/blog/markdown';
import { Bot, Calendar, Clock, ArrowLeft, ArrowRight } from 'lucide-react';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);

  if (!post) return { title: 'Post not found' };

  const url = `https://noomachy.com/blog/${post.slug}`;

  return {
    title: `${post.title} — SafeMemo AI`,
    description: post.description,
    keywords: post.tags,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: 'SafeMemo AI',
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: [{ url: '/og-image.png', width: 659, height: 659 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: ['/og-image.png'],
    },
    alternates: { canonical: url },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);

  if (!post) notFound();

  // Find related posts (same category, different slug)
  const related = POSTS
    .filter((p) => p.category === post.category && p.slug !== post.slug)
    .slice(0, 3);

  // JSON-LD structured data for SEO
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'SafeMemo AI',
      logo: { '@type': 'ImageObject', url: 'https://noomachy.com/icon.png' },
    },
    image: 'https://noomachy.com/og-image.png',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://noomachy.com/blog/${post.slug}`,
    },
    keywords: post.tags.join(', '),
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/50 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold">SafeMemo AI</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <Link href="/#how" className="text-sm text-zinc-400 hover:text-zinc-200">How it works</Link>
            <Link href="/#trust" className="text-sm text-zinc-400 hover:text-zinc-200">Trust</Link>
            <Link href="/blog" className="text-sm text-orange-400">Blog</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-zinc-200">
              Sign In
            </Link>
            <Link
              href="/#early-access"
              className="rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 text-sm font-medium text-white"
            >
              Request early access
            </Link>
          </div>
        </div>
      </nav>

      {/* Article */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        {/* Category */}
        <div className="mb-4">
          <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
            {post.category}
          </span>
        </div>

        {/* Meta */}
        <div className="mb-8 flex items-center gap-4 text-sm text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(post.date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {post.readTime}
          </span>
          <span>by {post.author}</span>
        </div>

        {/* Content */}
        <div className="prose-blog">{renderMarkdown(post.content)}</div>

        {/* Tags */}
        <div className="mt-12 flex flex-wrap gap-2 border-t border-zinc-800 pt-6">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-8 text-center">
          <h3 className="mb-2 text-xl font-bold">Ready to try SafeMemo AI?</h3>
          <p className="mb-6 text-zinc-400">
            Tamper-evident, human-validated agent memory for legal and compliance teams.
          </p>
          <Link
            href="/#early-access"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30"
          >
            Request early access
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-16 border-t border-zinc-800 pt-12">
            <h3 className="mb-6 text-xl font-bold">Related posts</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {related.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group rounded-lg border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-orange-500/40"
                >
                  <h4 className="mb-2 text-sm font-semibold text-zinc-100 group-hover:text-orange-400">
                    {p.title}
                  </h4>
                  <p className="text-xs text-zinc-500 line-clamp-2">{p.description}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Bot className="h-4 w-4" />
            SafeMemo AI
          </div>
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} SafeMemo AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
