'use client';

import { useMemo } from 'react';
import { orderBy, where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection';
import type { Message, SemanticMemory } from '@/types';
import { Brain, Wrench, Clock, Hash, MessageSquare, Zap, CheckCircle2, XCircle } from 'lucide-react';

interface RightPanelContentProps {
  tab: 'memory' | 'tools' | 'timeline';
  agentId: string | null;
  conversationId: string | null;
}

export default function RightPanelContent({ tab, agentId, conversationId }: RightPanelContentProps) {
  // Load semantic memories for this agent
  const { data: memories } = useFirestoreCollection<SemanticMemory>(
    agentId ? `agents/${agentId}/semanticMemory` : '',
    {
      constraints: [where('metadata.validationStatus', '==', 'approved')],
      enabled: !!agentId && tab === 'memory',
    }
  );

  // Load messages for the current conversation
  const { data: messages } = useFirestoreCollection<Message>(
    agentId && conversationId ? `agents/${agentId}/conversations/${conversationId}/messages` : '',
    {
      constraints: [orderBy('timestamp', 'asc')],
      enabled: !!agentId && !!conversationId,
    }
  );

  // Extract tools used in this conversation
  const toolsUsed = useMemo(() => {
    const counts = new Map<string, number>();
    for (const msg of messages) {
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          counts.set(tc.toolName, (counts.get(tc.toolName) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [messages]);

  if (!agentId) {
    return (
      <EmptyState icon={Brain} title="No agent selected" subtitle="Select an agent to see details" />
    );
  }

  if (tab === 'memory') {
    if (memories.length === 0) {
      return (
        <EmptyState
          icon={Brain}
          title="No memories yet"
          subtitle="As you chat, the agent will learn facts about you and save them here"
        />
      );
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Semantic Memory
          </h3>
          <span className="text-xs text-zinc-600">{memories.length}</span>
        </div>
        {memories.slice(0, 20).map((memory) => (
          <div
            key={memory.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <p className="text-xs leading-relaxed text-zinc-300">{memory.content}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-zinc-600">
                {(memory.metadata.confidence * 100).toFixed(0)}% confidence
              </span>
              {memory.metadata.tags?.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'tools') {
    if (!conversationId) {
      return (
        <EmptyState icon={Wrench} title="No conversation" subtitle="Select a conversation to see tool usage" />
      );
    }
    if (toolsUsed.length === 0) {
      return (
        <EmptyState icon={Wrench} title="No tools used yet" subtitle="Tool calls will appear here as the agent uses them" />
      );
    }
    return (
      <div className="space-y-2">
        <h3 className="pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Tools Used ({toolsUsed.length})
        </h3>
        {toolsUsed.map(([name, count]) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="h-3.5 w-3.5 shrink-0 text-orange-400" />
              <span className="truncate text-xs text-zinc-300">{name}</span>
            </div>
            <span className="shrink-0 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">
              {count}×
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (tab === 'timeline') {
    if (!conversationId) {
      return (
        <EmptyState icon={Clock} title="No conversation" subtitle="Select a conversation to see the timeline" />
      );
    }
    if (messages.length === 0) {
      return (
        <EmptyState icon={Clock} title="No events yet" subtitle="Send a message to see the activity timeline" />
      );
    }
    return (
      <div className="space-y-2">
        <h3 className="pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Activity Timeline
        </h3>
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className="flex gap-2">
            <div className="flex flex-col items-center">
              <div className={`h-2 w-2 rounded-full ${
                msg.role === 'user' ? 'bg-orange-500' : 'bg-zinc-500'
              }`} />
              {idx < messages.length - 1 && (
                <div className="w-px flex-1 bg-zinc-800" />
              )}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-1.5">
                {msg.role === 'user' ? (
                  <MessageSquare className="h-3 w-3 text-orange-400" />
                ) : (
                  <Hash className="h-3 w-3 text-zinc-500" />
                )}
                <span className="text-[10px] font-medium uppercase text-zinc-500">
                  {msg.role}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
                {typeof msg.content === 'string' ? msg.content.slice(0, 120) : '[tool call]'}
              </p>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {msg.toolCalls.map((tc, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-0.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500"
                    >
                      {tc.status === 'success' ? (
                        <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />
                      ) : (
                        <XCircle className="h-2.5 w-2.5 text-red-400" />
                      )}
                      {tc.toolName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="mb-3 h-8 w-8 text-zinc-700" />
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>
    </div>
  );
}
