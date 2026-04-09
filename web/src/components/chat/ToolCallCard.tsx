'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Wrench,
  Check,
  X,
} from 'lucide-react';
import type { ToolInvocation } from '@/types';

interface ToolCallCardProps {
  toolCall: ToolInvocation;
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isSuccess = toolCall.status === 'success';
  const durationMs = toolCall.duration;
  const durationLabel =
    durationMs >= 1000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${Math.round(durationMs)}ms`;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 text-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="font-medium text-zinc-200 truncate">
          {toolCall.toolName}
        </span>

        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500">{durationLabel}</span>
          {isSuccess ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <X className="h-3.5 w-3.5 text-red-400" />
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-700 px-3 py-2 space-y-2">
          {/* Params */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">
              Parameters
            </p>
            <pre className="whitespace-pre-wrap break-all rounded bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-300 max-h-48 overflow-y-auto">
              {JSON.stringify(toolCall.params, null, 2)}
            </pre>
          </div>

          {/* Result */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-1">Result</p>
            <pre
              className={`whitespace-pre-wrap break-all rounded px-2 py-1.5 font-mono text-xs max-h-48 overflow-y-auto ${
                isSuccess
                  ? 'bg-zinc-950 text-zinc-300'
                  : 'bg-red-950/40 text-red-300'
              }`}
            >
              {typeof toolCall.result === 'string'
                ? toolCall.result
                : JSON.stringify(toolCall.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
