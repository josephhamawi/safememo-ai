'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { X, Plus, Settings2, Loader2 } from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';
import type { AgentType } from '@/types';

interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (agentId: string) => void;
}

const AGENT_TYPES: { value: AgentType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'code', label: 'Code' },
  { value: 'research', label: 'Research' },
  { value: 'creative', label: 'Creative' },
  { value: 'planning', label: 'Planning' },
];

const MODEL_OPTIONS: { value: 'claude' | 'gemini'; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
];

export default function CreateAgentDialog({
  open,
  onClose,
  onCreated,
}: CreateAgentDialogProps) {
  const { user } = useAuth();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<AgentType>('general');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState<'claude' | 'gemini'>('claude');

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [maxWorkingMemoryMessages, setMaxWorkingMemoryMessages] = useState(50);
  const [semanticSearchTopK, setSemanticSearchTopK] = useState(10);
  const [autoApproval, setAutoApproval] = useState(true);
  const [autoApprovalThreshold, setAutoApprovalThreshold] = useState(0.85);

  // UI state
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setType('general');
    setSystemPrompt('');
    setModel('claude');
    setShowAdvanced(false);
    setTemperature(0.7);
    setMaxTokens(4096);
    setMaxWorkingMemoryMessages(50);
    setSemanticSearchTopK(10);
    setAutoApproval(true);
    setAutoApprovalThreshold(0.85);
    setError(null);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('You must be signed in to create an agent.');
      return;
    }
    if (!name.trim()) {
      setError('Agent name is required.');
      return;
    }

    setCreating(true);
    setError(null);

    const agentId = crypto.randomUUID();

    try {
      const ref = doc(db, 'agents', agentId);
      await setDoc(ref, {
        id: agentId,
        ownerId: user.uid,
        name: name.trim(),
        description: description.trim(),
        type,
        systemPrompt: systemPrompt.trim(),
        model,
        modelConfig: {
          temperature,
          maxTokens,
        },
        enabledSkills: [],
        memoryConfig: {
          maxWorkingMemoryMessages,
          semanticSearchTopK,
          episodicSearchTopK: 5,
          autoApprovalEnabled: autoApproval,
          autoApprovalThreshold,
        },
        channels: {
          web: { enabled: true },
        },
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
      onCreated?.(agentId);
      onClose();
    } catch (err) {
      console.error('Create agent error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to create agent.'
      );
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-zinc-100">
              Create New Agent
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Assistant"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A helpful assistant that..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
            />
          </div>

          {/* Type + Model row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AgentType)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              >
                {AGENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                Model
              </label>
              <select
                value={model}
                onChange={(e) =>
                  setModel(e.target.value as 'claude' | 'gemini')
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium text-zinc-300">
              System Prompt
              <HelpTooltip text="Define your agent's personality and behavior. This message guides all of its responses." />
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant that..."
              rows={4}
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
            />
          </div>

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              {/* Temperature */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="flex items-center gap-1 text-sm font-medium text-zinc-300">
                    Temperature
                    <HelpTooltip text="Controls creativity vs. precision. Lower = focused and deterministic. Higher = creative and varied." />
                  </label>
                  <span className="text-xs text-zinc-500">{temperature}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>

              {/* Max tokens */}
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-300">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={256}
                  max={200000}
                  step={256}
                  value={maxTokens}
                  onChange={(e) =>
                    setMaxTokens(parseInt(e.target.value, 10) || 4096)
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              {/* Memory config */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">
                    Working Memory Messages
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={maxWorkingMemoryMessages}
                    onChange={(e) =>
                      setMaxWorkingMemoryMessages(
                        parseInt(e.target.value, 10) || 50
                      )
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">
                    Semantic Search Top-K
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={semanticSearchTopK}
                    onChange={(e) =>
                      setSemanticSearchTopK(
                        parseInt(e.target.value, 10) || 10
                      )
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>
              </div>

              {/* Auto-approval */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1 text-sm font-medium text-zinc-300">
                  Auto-approve memories
                  <HelpTooltip text="Automatically save high-confidence insights to long-term memory without manual approval." />
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoApproval}
                  onClick={() => setAutoApproval((prev) => !prev)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    autoApproval ? 'bg-orange-600' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      autoApproval ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {autoApproval && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-400">
                      Approval Threshold
                    </label>
                    <span className="text-xs text-zinc-500">
                      {autoApprovalThreshold}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1}
                    step={0.05}
                    value={autoApprovalThreshold}
                    onChange={(e) =>
                      setAutoApprovalThreshold(parseFloat(e.target.value))
                    }
                    className="w-full accent-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              disabled={creating}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-40 disabled:hover:bg-orange-600"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Agent
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
