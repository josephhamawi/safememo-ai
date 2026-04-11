'use client';

import { useState, useMemo } from 'react';
import { Copy, Check, Bot, User, RotateCcw } from 'lucide-react';
import type { Message } from '@/types';
import ToolCallCard from '@/components/chat/ToolCallCard';

interface MessageBubbleProps {
  message: Message;
  onRetry?: (content: string) => void;
}

/**
 * Minimal markdown-like renderer for assistant messages.
 * Handles bold, inline code, fenced code blocks, and unordered/ordered lists.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push(
        <pre
          key={`code-${i}`}
          className="my-2 rounded-md bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed overflow-x-auto"
        >
          {lang && (
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
              {lang}
            </span>
          )}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Unordered list item
    if (/^\s*[-*]\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        listItems.push(
          <li key={`li-${i}`}>{renderInline(lines[i].replace(/^\s*[-*]\s/, ''))}</li>
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-1 ml-4 list-disc space-y-0.5">
          {listItems}
        </ul>
      );
      continue;
    }

    // Ordered list item
    if (/^\s*\d+[.)]\s/.test(line)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        listItems.push(
          <li key={`oli-${i}`}>
            {renderInline(lines[i].replace(/^\s*\d+[.)]\s/, ''))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-1 ml-4 list-decimal space-y-0.5">
          {listItems}
        </ol>
      );
      continue;
    }

    // Regular paragraph line
    if (line.trim() === '') {
      nodes.push(<br key={`br-${i}`} />);
    } else {
      nodes.push(
        <p key={`p-${i}`} className="my-0.5">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return nodes;
}

/** Render inline markdown (bold, inline code) */
function renderInline(text: string): React.ReactNode {
  // Split by inline code, then apply bold within non-code segments
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="rounded bg-zinc-700 px-1 py-0.5 text-xs font-mono text-zinc-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    // Bold: **text** or __text__
    const boldParts = part.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    return boldParts.map((bp, bi) => {
      if (
        (bp.startsWith('**') && bp.endsWith('**')) ||
        (bp.startsWith('__') && bp.endsWith('__'))
      ) {
        return (
          <strong key={`${idx}-${bi}`} className="font-semibold">
            {bp.slice(2, -2)}
          </strong>
        );
      }
      return <span key={`${idx}-${bi}`}>{bp}</span>;
    });
  });
}

export default function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isUser = message.role === 'user';
  const hasToolCalls =
    message.toolCalls && message.toolCalls.length > 0;

  const formattedTime = useMemo(() => {
    if (!message.timestamp) return '';
    const date =
      typeof message.timestamp.toDate === 'function'
        ? message.timestamp.toDate()
        : new Date(message.timestamp as unknown as number);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [message.timestamp]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may not be available
    }
  };

  return (
    <div
      className={`group flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`relative max-w-[80%] lg:max-w-[70%] ${
          isUser ? 'order-1' : 'order-1'
        }`}
      >
        {/* Avatar + bubble row */}
        <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Avatar */}
          <div
            className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              isUser ? 'bg-orange-600' : 'bg-zinc-700'
            }`}
          >
            {isUser ? (
              <User className="h-3.5 w-3.5 text-white" />
            ) : (
              <Bot className="h-3.5 w-3.5 text-zinc-300" />
            )}
          </div>

          {/* Bubble */}
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-800 text-zinc-100'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose-sm prose-invert max-w-none">
                {renderMarkdown(message.content)}
              </div>
            )}
          </div>
        </div>

        {/* Tool calls */}
        {hasToolCalls && (
          <div className={`mt-2 space-y-1.5 ${isUser ? 'mr-9' : 'ml-9'}`}>
            {message.toolCalls!.map((tc) => (
              <ToolCallCard key={tc.toolId} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Hover overlay: timestamp + copy */}
        {hovered && (
          <div
            className={`mt-1 flex items-center gap-2 text-xs text-zinc-500 ${
              isUser ? 'justify-end mr-9' : 'justify-start ml-9'
            }`}
          >
            <span>{formattedTime}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-0.5 hover:bg-zinc-700 transition-colors"
              aria-label="Copy message"
              title="Copy"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {isUser && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.content)}
                className="rounded p-0.5 hover:bg-zinc-700 transition-colors"
                aria-label="Retry message"
                title="Retry — resend this message"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
