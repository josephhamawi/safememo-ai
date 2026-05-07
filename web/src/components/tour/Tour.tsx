'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, MessageSquare, Wrench, Brain, Terminal, Settings,
  Sparkles, X, ArrowRight, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

interface TourStep {
  id: string;
  targetSelector?: string;
  title: string;
  description: string;
  icon: React.ElementType;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  cta?: { label: string; href?: string };
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Noomachy 👋',
    description:
      "Let's take a quick 60-second tour. You'll learn how to chat with your agent, install skills, and unlock the full power of your personal AI.",
    icon: Sparkles,
    position: 'center',
  },
  {
    id: 'agents',
    targetSelector: '[data-tour="agents"]',
    title: 'Your AI Agents',
    description:
      'Each agent has its own memory, skills, and personality. Switch between them, create new ones, or edit settings anytime.',
    icon: Bot,
    position: 'right',
  },
  {
    id: 'conversations',
    targetSelector: '[data-tour="conversations"]',
    title: 'Conversations',
    description:
      'Every chat is saved. Your agent remembers facts across conversations using sovereign memory — so it gets smarter every time.',
    icon: MessageSquare,
    position: 'right',
  },
  {
    id: 'commands',
    targetSelector: '[data-tour="right-panel"]',
    title: 'Commands, Memory, Tools & Timeline',
    description:
      'The right panel gives you slash commands, your agent\'s learned memory, tools used in this session, and a timeline of activity. Click any command card to run it instantly.',
    icon: Terminal,
    position: 'left',
  },
  {
    id: 'memory',
    title: 'Auditable memory',
    description:
      'Every fact your agent learns is staged for human review before it becomes long-term knowledge. The validation gate flags duplicates and contradictions automatically.',
    icon: Brain,
    position: 'center',
  },
  {
    id: 'audit',
    title: 'Tamper-evident audit trail',
    description:
      'Every approval, rejection, and tool call is hash-chained with SHA-256. Open any memory and click "View Audit Trail" to see the full lineage — or share a signed link with auditors.',
    icon: Wrench,
    position: 'center',
  },
  {
    id: 'done',
    title: "You're all set! 🎉",
    description:
      "That's it. Try sending a message to your agent now. Or open the Commands tab and click a command to run it. The more you use it, the smarter it gets.",
    icon: CheckCircle2,
    position: 'center',
  },
];

interface TourProps {
  onComplete: () => void;
}

export default function Tour({ onComplete }: TourProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const step = STEPS[stepIdx];

  // Update target rect when step changes
  useEffect(() => {
    if (!step?.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setTargetRect(null);
    }

    const update = () => {
      const e = document.querySelector(step.targetSelector!);
      if (e) setTargetRect(e.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  const next = useCallback(() => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      onComplete();
    }
  }, [stepIdx, onComplete]);

  const prev = useCallback(() => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }, [stepIdx]);

  const skip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, skip]);

  if (!mounted) return null;

  // Compute tooltip position
  const tooltipStyle: React.CSSProperties = {};
  const padding = 12;

  if (step.position === 'center' || !targetRect) {
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  } else {
    const r = targetRect;
    if (step.position === 'right') {
      tooltipStyle.left = r.right + padding;
      tooltipStyle.top = r.top + r.height / 2;
      tooltipStyle.transform = 'translateY(-50%)';
    } else if (step.position === 'left') {
      tooltipStyle.right = window.innerWidth - r.left + padding;
      tooltipStyle.top = r.top + r.height / 2;
      tooltipStyle.transform = 'translateY(-50%)';
    } else if (step.position === 'top') {
      tooltipStyle.bottom = window.innerHeight - r.top + padding;
      tooltipStyle.left = r.left + r.width / 2;
      tooltipStyle.transform = 'translateX(-50%)';
    } else {
      tooltipStyle.top = r.bottom + padding;
      tooltipStyle.left = r.left + r.width / 2;
      tooltipStyle.transform = 'translateX(-50%)';
    }
  }

  const Icon = step.icon;

  return createPortal(
    <div ref={containerRef} className="pointer-events-none fixed inset-0 z-[9999]">
      {/* Backdrop with optional spotlight */}
      <svg className="pointer-events-auto absolute inset-0 h-full w-full" onClick={skip}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={Math.max(0, targetRect.left - 8)}
                y={Math.max(0, targetRect.top - 8)}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Spotlight ring around target */}
      {targetRect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-orange-500 transition-all"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            boxShadow: '0 0 0 4px rgba(234, 88, 12, 0.2)',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="pointer-events-auto absolute w-[360px] max-w-[calc(100vw-32px)] rounded-2xl border border-orange-500/30 bg-zinc-900 p-5 shadow-2xl shadow-black/50"
        style={tooltipStyle}
      >
        <button
          onClick={skip}
          className="absolute right-3 top-3 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600">
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Step {stepIdx + 1} of {STEPS.length}
          </div>
        </div>

        <h3 className="mb-2 text-lg font-bold text-zinc-100">{step.title}</h3>
        <p className="mb-4 text-sm leading-relaxed text-zinc-400">{step.description}</p>

        {step.cta && step.cta.href && (
          <Link
            href={step.cta.href}
            onClick={() => {
              // Don't auto-advance — let the user navigate
              setTimeout(() => onComplete(), 300);
            }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            {step.cta.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={skip}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIdx > 0 && (
              <button
                onClick={prev}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-500"
            >
              {stepIdx === STEPS.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="mt-4 flex justify-center gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === stepIdx ? 'w-6 bg-orange-500' : 'w-1.5 bg-zinc-700'
              }`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
