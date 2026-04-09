'use client';

import { useAppStore } from '@/store';
import MemoryExplorer from '@/components/memory/MemoryExplorer';
import { Brain } from 'lucide-react';

export default function MemoryPage() {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);

  if (!selectedAgentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
        <Brain className="h-12 w-12" />
        <p className="text-lg font-medium">Select an agent first</p>
        <p className="text-sm">Choose an agent from the sidebar to explore its memory</p>
      </div>
    );
  }

  return <MemoryExplorer />;
}
