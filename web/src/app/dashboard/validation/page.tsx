'use client';

import { useAppStore } from '@/store';
import ValidationQueue from '@/components/memory/ValidationQueue';
import { ShieldCheck } from 'lucide-react';

export default function ValidationPage() {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);

  if (!selectedAgentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
        <ShieldCheck className="h-12 w-12" />
        <p className="text-lg font-medium">Select an agent first</p>
        <p className="text-sm">
          Each agent has its own validation queue. Choose one from the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-4">
        <h1 className="text-base font-semibold text-zinc-200">Pending validation</h1>
        <p className="mt-1 text-xs text-zinc-500">
          New memories proposed by the agent are staged here for human review.
          Approve to commit them to long-term semantic memory; reject to discard.
          Every decision is hash-chained into the audit log.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ValidationQueue agentId={selectedAgentId} />
      </div>
    </div>
  );
}
