'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAppStore } from '@/store';
import { useStreamingResponse } from '@/hooks/useStreamingResponse';
import type { Message } from '@/types';
import MessageBubble from '@/components/chat/MessageBubble';
import MessageInput from '@/components/chat/MessageInput';
import { Loader2, Bot, Square } from 'lucide-react';
import { parseSlashCommand, findCommand, BUILTIN_COMMANDS } from '@/lib/slashCommands';
import { useCustomCommands } from '@/hooks/useCustomCommands';

interface ChatInterfaceProps {
  agentId: string;
  conversationId: string;
}

export default function ChatInterface({
  agentId,
  conversationId,
}: ChatInterfaceProps) {
  const [messages, setLocalMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const { streamingContent, isStreaming } = useAppStore();
  const pendingPrompt = useAppStore((s) => s.pendingPrompt);
  const clearPendingPrompt = useAppStore((s) => s.clearPendingPrompt);
  useStreamingResponse(agentId, conversationId);
  const { commands: customCommands, saveCommand } = useCustomCommands();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Real-time Firestore listener for messages
  useEffect(() => {
    if (!agentId || !conversationId) return;

    setLoading(true);
    setError(null);

    const messagesRef = collection(
      db,
      'agents',
      agentId,
      'conversations',
      conversationId,
      'messages'
    );
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Message[];
        setLocalMessages(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Messages listener error:', err);
        setError('Failed to load messages. Please try again.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [agentId, conversationId]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = useCallback(
    async (content: string) => {
      if (sending) return;

      // -------- Slash command interception --------
      const messagesRefSlash = collection(
        db,
        'agents',
        agentId,
        'conversations',
        conversationId,
        'messages'
      );

      const parsed = parseSlashCommand(content);
      if (parsed) {
        // /set name prompt — save a custom command
        if (parsed.type === 'set') {
          try {
            await saveCommand(parsed.name, parsed.prompt);
            await addDoc(messagesRefSlash, {
              role: 'system',
              content: `✅ Saved command \`/${parsed.name}\`. Run it anytime by typing \`/${parsed.name}\`.`,
              timestamp: serverTimestamp(),
            });
          } catch (err) {
            await addDoc(messagesRefSlash, {
              role: 'system',
              content: `❌ Failed to save command: ${err instanceof Error ? err.message : String(err)}`,
              timestamp: serverTimestamp(),
            });
          }
          return;
        }

        // /list — show available commands
        if (parsed.type === 'list') {
          const allNames = [
            ...BUILTIN_COMMANDS.map((c) => `\`/${c.name}\` — ${c.description}`),
            ...customCommands.map((c) => `\`/${c.name}\` — ${c.description}`),
          ].join('\n');
          await addDoc(messagesRefSlash, {
            role: 'system',
            content: `**Available commands:**\n${allNames || '_(none)_'}\n\nCreate your own with \`/set <name> <prompt>\``,
            timestamp: serverTimestamp(),
          });
          return;
        }

        // /help — usage hint
        if (parsed.type === 'help') {
          await addDoc(messagesRefSlash, {
            role: 'system',
            content:
              '**Slash commands:**\n' +
              '- `/<name>` — run a saved command\n' +
              '- `/set <name> <prompt>` — save a new custom command\n' +
              '- `/list` — show all commands\n' +
              '- `/help` — this message\n\n' +
              'Open the **Commands** tab in the right panel for the full list.',
            timestamp: serverTimestamp(),
          });
          return;
        }

        // /<command> — expand and continue as a normal message
        if (parsed.type === 'invoke') {
          const cmd = findCommand(parsed.name, customCommands);
          if (cmd) {
            content = cmd.prompt; // expand to the full prompt
          } else {
            await addDoc(messagesRefSlash, {
              role: 'system',
              content: `❓ Unknown command \`/${parsed.name}\`. Type \`/list\` to see available commands.`,
              timestamp: serverTimestamp(),
            });
            return;
          }
        }
      }
      // -------- End slash command interception --------

      setSending(true);
      setError(null);

      const idempotencyKey = crypto.randomUUID();

      try {
        // Write user message to Firestore
        const messagesRef = collection(
          db,
          'agents',
          agentId,
          'conversations',
          conversationId,
          'messages'
        );

        await addDoc(messagesRef, {
          role: 'user',
          content,
          timestamp: serverTimestamp(),
          metadata: { idempotencyKey },
        });

        // Get auth token for API call
        const token = await auth.currentUser?.getIdToken();

        // Call agent API endpoint
        abortRef.current = new AbortController();
        const res = await fetch('/api/chat', {
          signal: abortRef.current.signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            agentId,
            conversationId,
            message: content,
            idempotencyKey,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }
      } catch (err) {
        console.error('Send error:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to send message.'
        );
      } finally {
        setSending(false);
      }
    },
    [agentId, conversationId, sending, customCommands, saveCommand]
  );

  // Listen for pending prompts (e.g. from clicking a command in the panel)
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.content) {
      const content = pendingPrompt.content;
      clearPendingPrompt();
      handleSend(content);
    }
  }, [pendingPrompt, handleSend, clearPendingPrompt]);

  // --- Render ---

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-900">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-900">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
            <Bot className="h-10 w-10 text-zinc-600" />
            <p className="text-sm">Send a message to start the conversation.</p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onRetry={handleSend} />
        ))}

        {/* Streaming content */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: '__streaming__',
              role: 'assistant',
              content: streamingContent,
              timestamp: null as unknown as Message['timestamp'],
            }}
          />
        )}

        {/* Thinking indicator */}
        {(sending || isStreaming) && !streamingContent && (
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-700">
              <Bot className="h-3.5 w-3.5 text-zinc-300" />
            </div>
            <div className="rounded-2xl bg-zinc-800 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 px-4 py-3">
        {sending ? (
          <div className="flex justify-center">
            <button
              onClick={() => {
                abortRef.current?.abort();
                setSending(false);
              }}
              className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop generating
            </button>
          </div>
        ) : (
          <MessageInput
            onSend={handleSend}
            disabled={isStreaming}
          />
        )}
      </div>
    </div>
  );
}
