'use client';

import { useState, useCallback } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
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
            Welcome to Noomachy
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
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 ring-1 ring-orange-500/20">
            <MessageSquare className="h-8 w-8 text-orange-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-zinc-100">
            {selectedAgent?.name || 'Agent'}
          </h2>
          <p className="mb-1 text-sm text-zinc-400">
            {selectedAgent?.description || 'Ready to chat'}
          </p>
          <p className="mb-6 text-xs text-zinc-600">
            {selectedAgent?.type} agent &middot; {selectedAgent?.model}
          </p>
          <div className="mx-auto max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="mb-4 text-sm text-zinc-400">
              Type a message to start a new conversation.
            </p>
            <NewConversationInput
              agentId={selectedAgentId}
              agentName={selectedAgent?.name || 'Agent'}
              onConversationCreated={setSelectedConversationId}
            />
          </div>
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const content = message.trim();
      if (!content || creating) return;

      setCreating(true);
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');

        // 1. Create conversation document
        const convsRef = collection(db, 'agents', agentId, 'conversations');
        const convDoc = await addDoc(convsRef, {
          agentId,
          userId: user.uid,
          title: content.substring(0, 60) + (content.length > 60 ? '...' : ''),
          source: 'web',
          messageCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 2. Add the first message
        const messagesRef = collection(
          db,
          'agents',
          agentId,
          'conversations',
          convDoc.id,
          'messages'
        );
        await addDoc(messagesRef, {
          role: 'user',
          content,
          timestamp: serverTimestamp(),
          metadata: { idempotencyKey: crypto.randomUUID() },
        });

        // 3. Call the chat API for a response
        const token = await user.getIdToken();
        try {
          const chatRes = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              agentId,
              conversationId: convDoc.id,
              message: content,
              idempotencyKey: crypto.randomUUID(),
            }),
          });

          // If mock response, write assistant message client-side
          const chatBody = await chatRes.json().catch(() => null);
          if (chatBody?.mock && chatBody.content) {
            await addDoc(messagesRef, {
              role: 'assistant',
              content: chatBody.content,
              timestamp: serverTimestamp(),
              metadata: { mock: true },
            });
          }
        } catch (err) {
          console.error('Chat API error:', err);
        }

        // 4. Navigate to the new conversation
        onConversationCreated(convDoc.id);
      } catch (err) {
        console.error('Failed to create conversation:', err);
      } finally {
        setCreating(false);
      }
    },
    [message, creating, agentId, onConversationCreated]
  );

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Message ${agentName}...`}
        disabled={creating}
        autoComplete="off"
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-3 pl-4 pr-12 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-orange-600 focus:ring-1 focus:ring-orange-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={creating || !message.trim()}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-orange-600 p-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
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
