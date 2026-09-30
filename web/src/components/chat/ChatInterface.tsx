'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Square } from 'lucide-react';

import MessageBubble from '@/components/chat/MessageBubble';
import MessageInput from '@/components/chat/MessageInput';
import { useCustomCommands } from '@/hooks/useCustomCommands';
import { conversations as conversationsApi, streamChat } from '@/lib/api';
import { BUILTIN_COMMANDS, findCommand, parseSlashCommand } from '@/lib/slashCommands';
import { useAppStore } from '@/store';
import type { Message } from '@/types';

interface ChatInterfaceProps {
  agentId: string;
  conversationId: string;
}

/**
 * Chat view.
 *
 * Firestore streamed the reply by writing one document per token and having
 * the client subscribe; the server now streams over SSE, so tokens arrive on
 * the same request that sent the message. Slash-command feedback is local
 * state — those lines were never conversation history, only UI.
 */
export default function ChatInterface({
  agentId,
  conversationId,
}: ChatInterfaceProps) {
  const [messages, setLocalMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const isStreaming = streamingContent.length > 0;

  const pendingPrompt = useAppStore((s) => s.pendingPrompt);
  const clearPendingPrompt = useAppStore((s) => s.clearPendingPrompt);
  const { commands: customCommands, saveCommand } = useCustomCommands();

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const rows = await conversationsApi.messages(conversationId);
      setLocalMessages(
        rows.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.createdAt,
        })) as unknown as Message[],
      );
      setError(null);
    } catch (err) {
      // A conversation the server has not seen yet is expected right after
      // it is started from the dashboard — not an error worth showing.
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!agentId || !conversationId) return;
    setLoading(true);
    void loadMessages();
  }, [agentId, conversationId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  /** Local-only notice, e.g. slash-command feedback. Never persisted. */
  const addSystemMessage = useCallback((content: string) => {
    setLocalMessages((prev) => [
      ...prev,
      {
        id: `local-${crypto.randomUUID()}`,
        role: 'system',
        content,
        timestamp: new Date().toISOString(),
      } as unknown as Message,
    ]);
  }, []);

  const handleSend = useCallback(
    async (content: string) => {
      if (sending || !content.trim()) return;

      // ---- Slash commands -------------------------------------------------
      // parseSlashCommand returns a discriminated union; switch on `type`.
      const parsed = parseSlashCommand(content);
      if (parsed) {
        switch (parsed.type) {
          case 'set': {
            try {
              await saveCommand(parsed.name, parsed.prompt);
              addSystemMessage(
                `✅ Saved command \`/${parsed.name}\`. Run it anytime by typing \`/${parsed.name}\`.`,
              );
            } catch (err) {
              addSystemMessage(
                `❌ Failed to save command: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
            return;
          }

          case 'list': {
            const allNames = [...BUILTIN_COMMANDS, ...customCommands]
              .map((c) => `- \`/${c.name}\` — ${c.description}`)
              .join('\n');
            addSystemMessage(
              `**Available commands:**\n${allNames || '_(none)_'}\n\nCreate your own with \`/set <name> <prompt>\``,
            );
            return;
          }

          case 'help': {
            addSystemMessage(
              'Usage: `/set <name> <prompt>` to save a command, `/list` to see them all.',
            );
            return;
          }

          case 'invoke': {
            const command = findCommand(parsed.name, customCommands);
            if (!command) {
              addSystemMessage(
                `❓ Unknown command \`/${parsed.name}\`. Type \`/list\` to see available commands.`,
              );
              return;
            }
            content = command.prompt;
            break;
          }
        }
      }

      // ---- Send -----------------------------------------------------------
      setSending(true);
      setError(null);
      setStreamingContent('');

      const sentContent = content;

      // Optimistic echo so the user's own message appears immediately.
      setLocalMessages((prev) => [
        ...prev,
        {
          id: `local-${crypto.randomUUID()}`,
          role: 'user',
          content: sentContent,
          timestamp: new Date().toISOString(),
        } as unknown as Message,
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(
          { agentId, conversationId, message: sentContent },
          (event) => {
            switch (event.type) {
              case 'text':
                setStreamingContent((prev) => prev + event.text);
                break;
              case 'tool_start':
                setStreamingContent((prev) => prev + `\n\n_Using ${event.toolName}…_\n\n`);
                break;
              case 'error':
                setError(event.message);
                break;
              default:
                break;
            }
          },
          controller.signal,
        );

        // Re-read from the server so the optimistic echo is replaced by the
        // persisted rows and their real ids.
        await loadMessages();
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Send error:', err);
          setError(err instanceof Error ? err.message : 'Failed to send message.');
        }
      } finally {
        setStreamingContent('');
        setSending(false);
        abortRef.current = null;
      }
    },
    [
      agentId,
      conversationId,
      sending,
      customCommands,
      saveCommand,
      addSystemMessage,
      loadMessages,
    ],
  );

  // A conversation started from the dashboard hands its first message over
  // here, so the reply streams in this view rather than being sent blind.
  useEffect(() => {
    const key = `safememo:pending:${conversationId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try {
      const { message } = JSON.parse(raw) as { message: string };
      if (message) void handleSend(message);
    } catch {
      // Malformed entry; nothing to send.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.content) {
      const content = pendingPrompt.content;
      clearPendingPrompt();
      void handleSend(content);
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
