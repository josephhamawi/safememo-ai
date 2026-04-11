'use client';

import { useState } from 'react';
import { useCustomCommands } from '@/hooks/useCustomCommands';
import { BUILTIN_COMMANDS, type SlashCommand } from '@/lib/slashCommands';
import { useAppStore } from '@/store';
import {
  Terminal, Cpu, Mail, Calendar, CheckSquare, FileText,
  Clipboard, Coffee, Target, Trash2, Sparkles, Copy, Check,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  'mac-info': Cpu,
  'clipboard': Clipboard,
  'emails': Mail,
  'unread': Mail,
  'today': Calendar,
  'week': Calendar,
  'reminders': CheckSquare,
  'notes': FileText,
  'morning': Coffee,
  'focus': Target,
};

const CATEGORY_LABELS: Record<string, string> = {
  system: 'System',
  productivity: 'Productivity',
  communication: 'Communication',
  utility: 'Utility',
  custom: 'My Commands',
};

export default function CommandsPanel() {
  const { commands: customCommands, deleteCommand } = useCustomCommands();
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [runningName, setRunningName] = useState<string | null>(null);

  const handleRun = (cmd: SlashCommand) => {
    setRunningName(cmd.name);
    setPendingPrompt(cmd.prompt);
    setTimeout(() => setRunningName(null), 600);
  };

  const allCommands = [...BUILTIN_COMMANDS, ...customCommands];

  // Group by category
  const grouped = allCommands.reduce<Record<string, SlashCommand[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  const handleCopy = async (name: string) => {
    try {
      await navigator.clipboard.writeText(`/${name}`);
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      {/* How-to guide */}
      <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-orange-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Quick Guide
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-zinc-400">
          Type <code className="rounded bg-zinc-800 px-1 text-orange-300">/command-name</code> in
          the chat to run a saved prompt instantly. Create your own with{' '}
          <code className="rounded bg-zinc-800 px-1 text-orange-300">/set name your prompt</code>.
        </p>
        <div className="mt-2 space-y-1 text-[10px] text-zinc-500">
          <div>
            <code className="text-zinc-400">/mac-info</code> → Run a built-in command
          </div>
          <div>
            <code className="text-zinc-400">/set daily-log Summarize my day in 3 bullets</code> → Save a custom one
          </div>
          <div>
            <code className="text-zinc-400">/list</code> → See all available commands
          </div>
        </div>
      </div>

      {/* Commands grouped by category */}
      {(['system', 'communication', 'productivity', 'utility', 'custom'] as const).map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <div key={cat}>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {CATEGORY_LABELS[cat]}
              <span className="ml-1 text-zinc-600">({items.length})</span>
            </h3>
            <div className="space-y-1.5">
              {items.map((cmd) => {
                const Icon = ICON_MAP[cmd.name] || Terminal;
                const isCopied = copiedName === cmd.name;
                const isRunning = runningName === cmd.name;
                return (
                  <div
                    key={cmd.name}
                    onClick={() => handleRun(cmd)}
                    className={`group cursor-pointer rounded-lg border bg-zinc-900 p-2.5 transition-all ${
                      isRunning
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-800 hover:border-orange-500/40 hover:bg-zinc-800/50'
                    }`}
                    title={`Click to run: ${cmd.prompt.slice(0, 100)}${cmd.prompt.length > 100 ? '...' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isRunning ? 'text-orange-300' : 'text-orange-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-medium text-zinc-200">
                            /{cmd.name}
                          </code>
                          {!cmd.builtin && (
                            <span className="rounded bg-orange-500/10 px-1 py-0.5 text-[8px] font-medium uppercase text-orange-400">
                              custom
                            </span>
                          )}
                          {isRunning && (
                            <span className="text-[9px] text-orange-300">→ Sending...</span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                          {cmd.description}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(cmd.name);
                          }}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                          title="Copy command syntax"
                        >
                          {isCopied ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                        {!cmd.builtin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCommand(cmd.name);
                            }}
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                            title="Delete command"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
