import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Bot,
  Download,
  Apple,
  CheckCircle2,
  Mail,
  FileText,
  Calendar,
  CheckSquare,
  Clipboard,
  Folder,
  Globe,
  Cpu,
  Github,
  ArrowLeft,
  Terminal,
  Shield,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Download Noomachy Desktop — Local Mac Integration',
  description:
    'Download the Noomachy desktop app to give your AI agent access to Apple Mail, Notes, Calendar, Reminders, Files, and more — all running locally on your Mac.',
  openGraph: {
    title: 'Download Noomachy Desktop',
    description: 'Local Mac integration for your AI agent.',
    url: 'https://noomachy.web.app/download',
  },
};

const TOOLS = [
  { icon: Mail, label: 'Apple Mail', desc: 'Read inbox, search, send' },
  { icon: FileText, label: 'Apple Notes', desc: 'Create, read, update, lock' },
  { icon: Calendar, label: 'Calendar', desc: 'Read events, create new ones' },
  { icon: CheckSquare, label: 'Reminders', desc: 'List, create with due dates' },
  { icon: Clipboard, label: 'Clipboard', desc: 'Read & write system clipboard' },
  { icon: Folder, label: 'Files', desc: 'Read, write, list local files' },
  { icon: Globe, label: 'Browser', desc: 'Open URLs in default browser' },
  { icon: Cpu, label: 'System', desc: 'Info, notifications, commands' },
];

export default function DownloadPage() {
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
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">
            Back to dashboard
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-16 md:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(234,88,12,0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-1.5 text-xs text-zinc-400">
            <Apple className="h-3 w-3" />
            macOS Desktop App
          </div>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Give your AI agent{' '}
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
              local Mac access
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-400">
            The Noomachy desktop app exposes your local Mac apps to your AI agent through a
            secure local MCP server. Read emails, manage notes, check your calendar — all from
            inside the chat.
          </p>

          {/* Download CTA */}
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-8">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20">
              <Download className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-bold">Noomachy for Mac</h2>
            <p className="text-center text-sm text-zinc-400">
              Free · macOS 12+ · Universal binary
            </p>
            <a
              href="https://github.com/josephhamawi/noomachy/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30"
            >
              <Apple className="h-4 w-4" />
              Download for macOS
            </a>
            <a
              href="https://github.com/josephhamawi/noomachy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <Github className="h-3 w-3" />
              Or build from source
            </a>
          </div>
        </div>
      </section>

      {/* Tools grid */}
      <section className="border-t border-zinc-800/50 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold">8 categories of local tools</h2>
            <p className="text-zinc-400">19+ tools for controlling your Mac from any AI agent</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((tool) => (
              <div
                key={tool.label}
                className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-orange-500/40"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                  <tool.icon className="h-5 w-5 text-orange-400" />
                </div>
                <h3 className="mb-1 font-semibold text-zinc-100">{tool.label}</h3>
                <p className="text-xs text-zinc-500">{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-zinc-800/50 bg-zinc-950/50 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold">How it works</h2>
            <p className="text-zinc-400">Privacy-first by design — your data never leaves your Mac</p>
          </div>
          <div className="space-y-6">
            <Step
              num="1"
              title="Install the desktop app"
              description="Download Noomachy for Mac and drag it into your Applications folder. Open it once to grant the necessary macOS permissions for Mail, Notes, Calendar, and Reminders."
            />
            <Step
              num="2"
              title="A local MCP server starts automatically"
              description="The app launches a small HTTP server on port 3939 that exposes your Mac apps as MCP tools. It's sandboxed, scoped to your user account, and only accessible to your Noomachy agent."
            />
            <Step
              num="3"
              title="A secure tunnel connects it to the cloud"
              description="A Cloudflare quick tunnel gives your local server a public HTTPS URL so your cloud agent can reach it. Tunnels are ephemeral and rotate per session."
            />
            <Step
              num="4"
              title="Your agent gains 19+ new tools"
              description="The desktop MCP automatically registers itself in your Noomachy account. Open the app and ask your agent to read your emails, check your calendar, or take notes."
            />
          </div>
        </div>
      </section>

      {/* Privacy promises */}
      <section className="border-t border-zinc-800/50 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold">Privacy guarantees</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PrivacyCard
              icon={Shield}
              title="Your data never leaves your Mac"
              description="Emails, notes, files — they all stay local. Only the specific results your agent asks for travel through the tunnel."
            />
            <PrivacyCard
              icon={CheckCircle2}
              title="No OAuth tokens stored in the cloud"
              description="Unlike cloud-only AI assistants, we don't ask you to OAuth into Gmail or anything else. The app reads your local Apple Mail directly."
            />
            <PrivacyCard
              icon={Terminal}
              title="Open source"
              description="The desktop app and MCP server are open source. Audit the code, build it yourself, fork it. No black boxes."
            />
            <PrivacyCard
              icon={CheckCircle2}
              title="No training on your data"
              description="Your local data never enters any model's training pool. Cloud LLM calls use the API tier with contractual no-training clauses."
            />
          </div>
        </div>
      </section>

      {/* Build from source */}
      <section className="border-t border-zinc-800/50 bg-zinc-950/50 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-4 text-2xl font-bold">Build from source</h2>
          <p className="mb-6 text-zinc-400">
            Prefer to build it yourself? The desktop app is open source and easy to compile.
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
              <Terminal className="h-3 w-3" />
              Terminal
            </div>
            <pre className="overflow-x-auto text-xs leading-relaxed text-zinc-300">
              <code>{`# Clone the repository
git clone https://github.com/josephhamawi/noomachy.git
cd noomachy

# Build the local MCP server
cd desktop-mcp && npm install && npm run build && cd ..

# Build the desktop app
cd desktop-app && npm install && npm run dist

# Find the .dmg in desktop-app/release/`}</code>
            </pre>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Requires Node.js 20+ and macOS 12+. The build produces a .dmg installer in the
            release folder.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800/50 px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to give your agent local powers?</h2>
          <p className="mb-8 text-zinc-400">
            Free download. Open source. Privacy-first.
          </p>
          <a
            href="https://github.com/josephhamawi/noomachy/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30"
          >
            <Apple className="h-4 w-4" />
            Download Noomachy for Mac
          </a>
          <p className="mt-4 text-xs text-zinc-600">macOS 12 Monterey or later · Apple Silicon &amp; Intel</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Noomachy
          </div>
          <div className="flex gap-4">
            <Link href="/blog" className="hover:text-zinc-400">Blog</Link>
            <Link href="/terms" className="hover:text-zinc-400">Terms</Link>
            <Link href="/privacy" className="hover:text-zinc-400">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({ num, title, description }: { num: string; title: string; description: string }) {
  return (
    <div className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-sm font-bold text-white">
        {num}
      </div>
      <div>
        <h3 className="mb-1 text-base font-semibold text-zinc-100">{title}</h3>
        <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function PrivacyCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
        <Icon className="h-5 w-5 text-orange-400" />
      </div>
      <h3 className="mb-2 font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}
