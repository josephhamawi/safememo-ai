'use client';

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { Send, Paperclip } from 'lucide-react';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea up to a max height
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 focus-within:ring-2 focus-within:ring-orange-500/50 focus-within:border-orange-500/50 transition-all">
      {/* File attachment (UI only) */}
      <button
        type="button"
        className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-40"
        disabled={disabled}
        aria-label="Attach file"
      >
        <Paperclip className="h-4 w-4" />
      </button>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50"
        style={{ maxHeight: 200 }}
      />

      {/* Send button */}
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="mb-0.5 shrink-0 rounded-lg bg-orange-600 p-1.5 text-white transition-colors hover:bg-orange-500 disabled:opacity-40 disabled:hover:bg-orange-600"
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
