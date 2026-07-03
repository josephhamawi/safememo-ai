'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAppStore } from '@/store';
import {
  Settings, Bot, Save, Loader2, User, Shield, Bell, Link2, Brain,
  Cpu, MessageSquare, Mail, Hash, Key, Check,
} from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';

type SettingsTab = 'profile' | 'agent' | 'notifications' | 'security';

const TABS: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'agent', label: 'Agent', icon: Bot },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'security', label: 'Security', icon: Shield },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const agents = useAppStore((s) => s.agents);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Agent settings state
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [model, setModel] = useState<'claude' | 'gemini'>('claude');
  const [autoApproval, setAutoApproval] = useState(true);
  const [autoApprovalThreshold, setAutoApprovalThreshold] = useState(0.9);

  // Notification state
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [memoryNotifs, setMemoryNotifs] = useState(true);
  const [errorNotifs, setErrorNotifs] = useState(true);
  const [skillNotifs, setSkillNotifs] = useState(false);

  // Profile state
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (selectedAgent) {
      setAgentName(selectedAgent.name);
      setAgentDescription(selectedAgent.description);
      setSystemPrompt(selectedAgent.systemPrompt);
      setModel(selectedAgent.model || 'claude');
      setTemperature(selectedAgent.modelConfig.temperature);
      setMaxTokens(selectedAgent.modelConfig.maxTokens);
      setAutoApproval(selectedAgent.memoryConfig.autoApprovalEnabled);
      setAutoApprovalThreshold(selectedAgent.memoryConfig.autoApprovalThreshold);
    }
  }, [selectedAgent]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (activeTab === 'agent' && selectedAgentId) {
        await updateDoc(doc(db, 'agents', selectedAgentId), {
          name: agentName,
          description: agentDescription,
          systemPrompt,
          model,
          'modelConfig.temperature': temperature,
          'modelConfig.maxTokens': maxTokens,
          'memoryConfig.autoApprovalEnabled': autoApproval,
          'memoryConfig.autoApprovalThreshold': autoApprovalThreshold,
          updatedAt: serverTimestamp(),
        });
      } else if (activeTab === 'profile' && user) {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: displayName.trim(),
          updatedAt: serverTimestamp(),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 md:flex-row">
      {/* Tab sidebar */}
      <div className="flex border-b border-zinc-800 md:w-52 md:flex-col md:border-b-0 md:border-r">
        <div className="hidden items-center gap-2 border-b border-zinc-800 px-5 py-4 md:flex">
          <Settings className="h-5 w-5 text-orange-400" />
          <h1 className="text-sm font-semibold text-zinc-100">Settings</h1>
        </div>
        <div className="flex flex-1 overflow-x-auto md:flex-col md:py-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2.5 whitespace-nowrap px-5 py-2.5 text-sm transition-colors md:w-full ${
                  activeTab === tab.key
                    ? 'border-b-2 border-orange-500 text-orange-400 md:border-b-0 md:border-l-2 md:bg-orange-500/5'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* ---- PROFILE TAB ---- */}
          {activeTab === 'profile' && (
            <>
              <h2 className="text-lg font-semibold text-zinc-100">Profile</h2>
              <Section title="Account Information">
                <Field label="Display Name">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-600 focus:outline-none"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-500"
                  />
                </Field>
                <Field label="User ID">
                  <input
                    type="text"
                    value={user?.uid || ''}
                    disabled
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-500 font-mono text-xs"
                  />
                </Field>
              </Section>
              <Section title="Plan & Usage">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-200 capitalize">{profile?.plan || 'free'} Plan</p>
                    <p className="text-xs text-zinc-500">
                      {agents.length} / {profile?.agentLimit ?? 3} agents used
                    </p>
                  </div>
                  <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400 capitalize">
                    {profile?.plan || 'free'}
                  </span>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-zinc-500">
                    <span>API Tokens Used</span>
                    <span>{((profile?.apiUsage?.tokensUsed ?? 0) / 1000).toFixed(1)}K / {((profile?.apiUsage?.tokensLimit ?? 100000) / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800">
                    <div
                      className="h-2 rounded-full bg-orange-500 transition-all"
                      style={{ width: `${Math.min(100, ((profile?.apiUsage?.tokensUsed ?? 0) / (profile?.apiUsage?.tokensLimit ?? 100000)) * 100)}%` }}
                    />
                  </div>
                </div>
              </Section>
              <SaveButton saving={saving} saved={saved} onClick={handleSave} />
            </>
          )}

          {/* ---- AGENT TAB ---- */}
          {activeTab === 'agent' && (
            <>
              <h2 className="text-lg font-semibold text-zinc-100">Agent Configuration</h2>
              {!selectedAgent ? (
                <div className="flex flex-col items-center gap-3 py-12 text-zinc-500">
                  <Bot className="h-10 w-10" />
                  <p className="text-sm">Select an agent from the sidebar</p>
                </div>
              ) : (
                <>
                  <Section title="Basic Information">
                    <Field label="Name">
                      <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-600 focus:outline-none" />
                    </Field>
                    <Field label="Description">
                      <input type="text" value={agentDescription} onChange={(e) => setAgentDescription(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-600 focus:outline-none" />
                    </Field>
                    <Field label="System Prompt" help="Core instructions that define the agent's behavior and personality.">
                      <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={5}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-600 focus:outline-none" />
                    </Field>
                  </Section>
                  <Section title="Model">
                    <Field label="AI Model" help="Claude is optimized for reasoning. Gemini excels at multimodal tasks.">
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value as 'claude' | 'gemini')}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-600 focus:outline-none"
                      >
                        <option value="claude">Claude</option>
                        <option value="gemini">Gemini</option>
                      </select>
                    </Field>
                    <Field label="Temperature" help="0 = deterministic. 1 = creative." trailing={temperature.toFixed(2)}>
                      <input type="range" min="0" max="1" step="0.05" value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-orange-500" />
                    </Field>
                    <Field label="Max Tokens" help="Maximum response length.">
                      <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                        min={256} max={200000}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-600 focus:outline-none" />
                    </Field>
                  </Section>
                  <Section title="Memory" help="Control how your agent learns and remembers.">
                    <Toggle label="Auto-approve memories" description="Save high-confidence insights without manual approval"
                      value={autoApproval} onChange={setAutoApproval} />
                    {autoApproval && (
                      <Field label="Approval Threshold" trailing={`${(autoApprovalThreshold * 100).toFixed(0)}%`}>
                        <input type="range" min="0.5" max="1" step="0.05" value={autoApprovalThreshold}
                          onChange={(e) => setAutoApprovalThreshold(parseFloat(e.target.value))} className="w-full accent-orange-500" />
                      </Field>
                    )}
                  </Section>
                  <SaveButton saving={saving} saved={saved} onClick={handleSave} />
                </>
              )}
            </>
          )}

          {/* ---- NOTIFICATIONS TAB ---- */}
          {activeTab === 'notifications' && (
            <>
              <h2 className="text-lg font-semibold text-zinc-100">Notifications</h2>
              <Section title="Email Notifications">
                <Toggle label="Email notifications" description="Receive important alerts via email"
                  value={emailNotifs} onChange={setEmailNotifs} />
              </Section>
              <Section title="In-App Notifications">
                <Toggle label="Memory validation" description="When memories are approved or rejected"
                  value={memoryNotifs} onChange={setMemoryNotifs} />
                <Toggle label="Agent errors" description="When an agent encounters an error"
                  value={errorNotifs} onChange={setErrorNotifs} />
                <Toggle label="Skill updates" description="When installed skills have new versions"
                  value={skillNotifs} onChange={setSkillNotifs} />
              </Section>
            </>
          )}

          {/* ---- SECURITY TAB ---- */}
          {activeTab === 'security' && (
            <>
              <h2 className="text-lg font-semibold text-zinc-100">Security & Privacy</h2>
              <Section title="Authentication">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-200">Sign-in Method</p>
                    <p className="text-xs text-zinc-500">
                      {user?.providerData?.[0]?.providerId === 'google.com' ? 'Google' :
                       user?.providerData?.[0]?.providerId === 'github.com' ? 'GitHub' : 'Email/Password'}
                    </p>
                  </div>
                  <Shield className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-200">Account Created</p>
                    <p className="text-xs text-zinc-500">{user?.metadata?.creationTime || 'Unknown'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-200">Last Sign-in</p>
                    <p className="text-xs text-zinc-500">{user?.metadata?.lastSignInTime || 'Unknown'}</p>
                  </div>
                </div>
              </Section>
              <Section title="Data & Privacy">
                <div className="space-y-3">
                  <p className="text-sm text-zinc-400">
                    Your data is stored securely in Firebase with multi-tenant isolation.
                    Each agent's data is scoped to your account and cannot be accessed by other users.
                  </p>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <p className="text-xs font-medium text-zinc-300">Data stored:</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-zinc-500">
                      <li>- Conversations and messages</li>
                      <li>- Agent configurations and memory</li>
                      <li>- Installed skills and preferences</li>
                      <li>- Audit logs (tamper-proof)</li>
                    </ul>
                  </div>
                </div>
              </Section>
              <Section title="API Keys">
                <p className="text-sm text-zinc-400">
                  API keys are stored as encrypted Firebase secrets and are never exposed to the client.
                  They are only accessible to Cloud Functions at runtime.
                </p>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Helper components ---- */

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
        {help && <HelpTooltip text={help} />}
      </div>
      {children}
    </section>
  );
}

function Field({ label, help, trailing, children }: { label: string; help?: string; trailing?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-sm text-zinc-400">
        <span className="flex items-center gap-1">
          {label}
          {help && <HelpTooltip text={help} />}
        </span>
        {trailing && <span className="font-mono text-zinc-300">{trailing}</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-orange-600' : 'bg-zinc-700'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function SaveButton({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onClick}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  );
}
