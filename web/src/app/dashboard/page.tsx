'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store';
import { Bot, MessageSquare, Plus, Loader2, Send } from 'lucide-react';
import CreateAgentDialog from '@/components/chat/CreateAgentDialog';
import ChatInterface from '@/components/chat/ChatInterface';

export default function DashboardPage() {
  const {
    agents,
    selectedAgentId,
    selectedConversationId,
    setSelectedConversationId,
  } = useAppStore();
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // No agent selected - welcome state
  if (!selectedAgentId || agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 ring-1 ring-orange-500/20">
            <Bot className="h-8 w-8 text-orange-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-zinc-100">
            Welcome to SafeMemo AI
          </h2>
          <p className="mb-6 text-sm text-zinc-500">
            Create your first AI agent to get started. Agents can remember conversations,
            use tools, and learn from experience.
          </p>
          <button
            onClick={() => setShowCreateAgent(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create Your First Agent
          </button>
        </div>
        {showCreateAgent && (
          <CreateAgentDialog open={showCreateAgent} onClose={() => setShowCreateAgent(false)} />
        )}
      </div>
    );
  }

  // Agent selected but no conversation - prompt to start
  if (!selectedConversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 ring-1 ring-orange-500/20">
            <MessageSquare className="h-8 w-8 text-orange-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-zinc-100">
            {selectedAgent?.name || 'Agent'}
          </h2>
          <p className="mb-1 text-sm text-zinc-400">
            {selectedAgent?.systemPrompt?.slice(0, 120) || 'Ready to chat'}
          </p>
          <p className="text-xs text-zinc-600">
            {selectedAgent?.provider} &middot; {selectedAgent?.model}
          </p>
        </div>
        <div className="w-full max-w-2xl">
          <p className="mb-3 text-center text-sm text-zinc-500">
            Type a message to start a new conversation.
          </p>
          <NewConversationInput
            agentId={selectedAgentId}
            agentName={selectedAgent?.name || 'Agent'}
            onConversationCreated={setSelectedConversationId}
          />
        </div>
      </div>
    );
  }

  // Conversation selected - show real chat interface
  return (
    <ChatInterface agentId={selectedAgentId} conversationId={selectedConversationId} />
  );
}

function NewConversationInput({
  agentId,
  agentName,
  onConversationCreated,
}: {
  agentId: string;
  agentName: string;
  onConversationCreated: (id: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const submitContent = useCallback(
    async (content: string) => {
      if (!content.trim() || creating) return;
      setCreating(true);
      try {
        // The conversation id is minted client-side and the server creates the
        // row on first use, so one round trip covers create-and-send.
        const conversationId = crypto.randomUUID();

        // Navigate immediately; the chat view owns the streaming request so
        // the reply renders token by token instead of after a full round trip.
        onConversationCreated(conversationId);
        sessionStorage.setItem(
          `safememo:pending:${conversationId}`,
          JSON.stringify({ agentId, message: content }),
        );
      } catch (err) {
        console.error('Failed to create conversation:', err);
      } finally {
        setCreating(false);
      }
    },
    [agentId, creating, onConversationCreated]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      submitContent(message.trim());
    },
    [message, submitContent]
  );

  // Listen for pending prompts (e.g. from clicking a command in the panel)
  const pendingPrompt = useAppStore((s) => s.pendingPrompt);
  const clearPendingPrompt = useAppStore((s) => s.clearPendingPrompt);
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.content) {
      const content = pendingPrompt.content;
      clearPendingPrompt();
      submitContent(content);
    }
  }, [pendingPrompt, submitContent, clearPendingPrompt]);

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 focus-within:border-orange-600 focus-within:ring-1 focus-within:ring-orange-600 transition-all">
      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (message.trim() && !creating) {
              handleSubmit(e as unknown as React.FormEvent);
            }
          }
        }}
        placeholder={`Message ${agentName}...`}
        disabled={creating}
        autoComplete="off"
        rows={1}
        className="flex-1 resize-none bg-transparent py-1 text-sm text-zinc-100 placeholder-zinc-600 outline-none disabled:opacity-50"
        style={{ minHeight: '24px', maxHeight: '200px' }}
      />
      <button
        type="submit"
        disabled={creating || !message.trim()}
        className="mb-0.5 shrink-0 rounded-lg bg-orange-600 p-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {creating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </form>
  );
}
