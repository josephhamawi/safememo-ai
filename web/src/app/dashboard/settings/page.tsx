'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/store';
import type { Agent } from '@/types';
import { Settings, Bot, Save, Loader2, Trash2 } from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';

export default function SettingsPage() {
  const { user } = useAuth();
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const agents = useAppStore((s) => s.agents);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [autoApproval, setAutoApproval] = useState(true);
  const [autoApprovalThreshold, setAutoApprovalThreshold] = useState(0.9);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedAgent) {
      setAgentName(selectedAgent.name);
      setAgentDescription(selectedAgent.description);
      setSystemPrompt(selectedAgent.systemPrompt);
      setTemperature(selectedAgent.modelConfig.temperature);
      setMaxTokens(selectedAgent.modelConfig.maxTokens);
      setAutoApproval(selectedAgent.memoryConfig.autoApprovalEnabled);
      setAutoApprovalThreshold(selectedAgent.memoryConfig.autoApprovalThreshold);
    }
  }, [selectedAgent]);

  const handleSave = async () => {
    if (!selectedAgentId) return;
    setSaving(true);
    try {
      const ref = doc(db, 'agents', selectedAgentId);
      await updateDoc(ref, {
        name: agentName,
        description: agentDescription,
        systemPrompt,
        'modelConfig.temperature': temperature,
        'modelConfig.maxTokens': maxTokens,
        'memoryConfig.autoApprovalEnabled': autoApproval,
        'memoryConfig.autoApprovalThreshold': autoApprovalThreshold,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedAgentId || !selectedAgent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
        <Settings className="h-12 w-12" />
        <p className="text-lg font-medium">Select an agent</p>
        <p className="text-sm">Choose an agent from the sidebar to configure it</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-blue-400" />
        <h1 className="text-xl font-semibold text-zinc-100">Agent Settings</h1>
      </div>

      {/* Basic Info */}
      <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Basic Information
        </h2>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Name</label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Description</label>
          <input
            type="text"
            value={agentDescription}
            onChange={(e) => setAgentDescription(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-sm text-zinc-400">
            System Prompt
            <HelpTooltip text="Core instructions that define the agent's behavior, personality, and capabilities for every conversation." />
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </section>

      {/* Model Config */}
      <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Model Configuration
        </h2>
        <div>
          <label className="mb-1 flex items-center justify-between text-sm text-zinc-400">
            <span className="flex items-center gap-1">Temperature <HelpTooltip text="Controls response randomness. 0 = deterministic and focused. 1 = creative and varied." /></span>
            <span className="font-mono text-zinc-300">{temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-sm text-zinc-400">
            Max Tokens
            <HelpTooltip text="Maximum response length. Higher values allow longer replies but use more API credits." />
          </label>
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
            min={256}
            max={32768}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </section>

      {/* Memory Config */}
      <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Memory Configuration
          </h2>
          <HelpTooltip text="Control how your agent learns and remembers. Auto-approval lets the agent save insights without manual review." />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-200">Auto-Approval</p>
            <p className="text-xs text-zinc-500">
              Automatically approve high-confidence memories
            </p>
          </div>
          <button
            onClick={() => setAutoApproval(!autoApproval)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              autoApproval ? 'bg-blue-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                autoApproval ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        {autoApproval && (
          <div>
            <label className="mb-1 flex items-center justify-between text-sm text-zinc-400">
              <span>Auto-Approval Threshold</span>
              <span className="font-mono text-zinc-300">
                {(autoApprovalThreshold * 100).toFixed(0)}%
              </span>
            </label>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              value={autoApprovalThreshold}
              onChange={(e) => setAutoApprovalThreshold(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        )}
      </section>

      {/* Channel Config - placeholder */}
      <section className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Channel Connections
        </h2>
        <p className="text-sm text-zinc-500">
          Connect Telegram, Discord, and Slack channels in the Channels section (coming soon).
        </p>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
