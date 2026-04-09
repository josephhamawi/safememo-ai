'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import {
  ArrowLeft,
  ArrowRight,
  User,
  Briefcase,
  Brain,
  Globe,
  Megaphone,
  Loader2,
  Sparkles,
  Code,
  Search,
  Palette,
  BarChart3,
} from 'lucide-react';
import type { PrimaryUse, AiExperience, ReferralSource, ChannelSource } from '@/types';

const STEPS = ['About You', 'Primary Use', 'Experience', 'Channels', 'How You Found Us'];

interface OnboardingData {
  name: string;
  role: string;
  primaryUse: PrimaryUse | null;
  aiExperience: AiExperience | null;
  preferredIntegrations: ChannelSource[];
  referralSource: ReferralSource | null;
}

const PRIMARY_USE_OPTIONS: { value: PrimaryUse; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'personal_assistant', label: 'Personal Assistant', description: 'Daily tasks, scheduling, reminders', icon: Sparkles },
  { value: 'coding', label: 'Coding', description: 'Write, review, and debug code', icon: Code },
  { value: 'research', label: 'Research', description: 'Deep research and analysis', icon: Search },
  { value: 'creative_writing', label: 'Creative Writing', description: 'Stories, content, copywriting', icon: Palette },
  { value: 'business', label: 'Business', description: 'Strategy, planning, analytics', icon: BarChart3 },
];

const EXPERIENCE_OPTIONS: { value: AiExperience; label: string; description: string }[] = [
  { value: 'beginner', label: 'Beginner', description: "I'm just getting started with AI" },
  { value: 'intermediate', label: 'Intermediate', description: "I've used ChatGPT and similar tools" },
  { value: 'expert', label: 'Expert', description: "I've built AI systems or agents before" },
];

const CHANNEL_OPTIONS: { value: ChannelSource; label: string }[] = [
  { value: 'web', label: 'Web' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'discord', label: 'Discord' },
  { value: 'slack', label: 'Slack' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const REFERRAL_OPTIONS: { value: ReferralSource; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'referral', label: 'Referral' },
  { value: 'web_search', label: 'Web Search' },
  { value: 'kodefoundry', label: 'KodeFoundry' },
  { value: 'other', label: 'Other' },
];

const USE_TO_AGENT_TYPE: Record<PrimaryUse, { type: string; name: string; prompt: string }> = {
  personal_assistant: {
    type: 'general',
    name: 'My Assistant',
    prompt: 'You are a helpful personal assistant. Be concise, proactive, and remember user preferences.',
  },
  coding: {
    type: 'code',
    name: 'Code Companion',
    prompt: 'You are an expert software engineer. Write clean, well-documented code. Explain your reasoning.',
  },
  research: {
    type: 'research',
    name: 'Research Analyst',
    prompt: 'You are a thorough research analyst. Provide well-sourced, balanced analysis. Cite your reasoning.',
  },
  creative_writing: {
    type: 'creative',
    name: 'Creative Writer',
    prompt: 'You are a talented creative writer. Match the user\'s tone and style. Be imaginative yet coherent.',
  },
  business: {
    type: 'planning',
    name: 'Business Strategist',
    prompt: 'You are a business strategist. Provide data-driven insights. Think in frameworks and actionable steps.',
  },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    name: auth.currentUser?.displayName || '',
    role: '',
    primaryUse: null,
    aiExperience: null,
    preferredIntegrations: ['web'],
    referralSource: null,
  });

  const canContinue = () => {
    switch (step) {
      case 0: return data.name.trim().length > 0;
      case 1: return data.primaryUse !== null;
      case 2: return data.aiExperience !== null;
      case 3: return data.preferredIntegrations.length > 0;
      case 4: return data.referralSource !== null;
      default: return false;
    }
  };

  const handleComplete = async () => {
    const user = auth.currentUser;
    if (!user || !data.primaryUse) return;

    setSaving(true);
    try {
      // Update user profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: data.name.trim(),
        onboardingCompleted: true,
        onboarding: {
          role: data.role.trim() || undefined,
          primaryUse: data.primaryUse,
          aiExperience: data.aiExperience,
          preferredIntegrations: data.preferredIntegrations,
          referralSource: data.referralSource,
          completedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      // Create first agent based on primary use
      const agentConfig = USE_TO_AGENT_TYPE[data.primaryUse];
      const agentId = crypto.randomUUID();
      const channels: Record<string, { enabled: boolean }> = { web: { enabled: true } };
      for (const ch of data.preferredIntegrations) {
        channels[ch] = { enabled: true };
      }

      await setDoc(doc(db, 'agents', agentId), {
        id: agentId,
        ownerId: user.uid,
        name: agentConfig.name,
        description: `Your ${agentConfig.type} agent, created during onboarding.`,
        type: agentConfig.type,
        systemPrompt: agentConfig.prompt,
        model: 'claude',
        modelConfig: { temperature: 0.7, maxTokens: 4096 },
        enabledSkills: [],
        memoryConfig: {
          maxWorkingMemoryMessages: 50,
          semanticSearchTopK: 10,
          episodicSearchTopK: 5,
          autoApprovalEnabled: data.aiExperience === 'expert',
          autoApprovalThreshold: 0.85,
        },
        channels,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace('/dashboard');
    } catch (err) {
      console.error('Onboarding error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  return (
    <div className="w-full max-w-lg">
      {/* Progress */}
      <div className="mb-10 flex items-center justify-center gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-10 rounded-full transition-colors ${
              i <= step ? 'bg-orange-500' : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>

      <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
        Step {step + 1} of {STEPS.length}
      </div>

      {/* Step 0: Name & Role */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <User className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Welcome! Tell us about yourself</h2>
            <p className="mt-2 text-sm text-zinc-500">We'll personalize your experience based on your answers.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              What should we call you? <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
              placeholder="Your name"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              What's your role?
            </label>
            <input
              type="text"
              value={data.role}
              onChange={(e) => setData({ ...data, role: e.target.value })}
              placeholder="e.g. Software Engineer, Student, Entrepreneur..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>
        </div>
      )}

      {/* Step 1: Primary Use */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Briefcase className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">What will you use Noomachy for?</h2>
            <p className="mt-2 text-sm text-zinc-500">We'll create your first agent based on this.</p>
          </div>
          <div className="space-y-3">
            {PRIMARY_USE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setData({ ...data, primaryUse: opt.value })}
                className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
                  data.primaryUse === opt.value
                    ? 'border-orange-600 bg-orange-500/5'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  data.primaryUse === opt.value ? 'bg-orange-500/20' : 'bg-zinc-800'
                }`}>
                  <opt.icon className={`h-5 w-5 ${data.primaryUse === opt.value ? 'text-orange-400' : 'text-zinc-400'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-100">{opt.label}</p>
                  <p className="text-xs text-zinc-500">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: AI Experience */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Brain className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">How experienced are you with AI?</h2>
            <p className="mt-2 text-sm text-zinc-500">This helps us adjust the interface complexity.</p>
          </div>
          <div className="space-y-3">
            {EXPERIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setData({ ...data, aiExperience: opt.value })}
                className={`flex w-full flex-col rounded-xl border p-5 text-left transition-colors ${
                  data.aiExperience === opt.value
                    ? 'border-orange-600 bg-orange-500/5'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <p className="text-sm font-medium text-zinc-100">{opt.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Preferred Channels */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Globe className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Where will you use your agents?</h2>
            <p className="mt-2 text-sm text-zinc-500">Select all that apply. You can add more later.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {CHANNEL_OPTIONS.map((opt) => {
              const selected = data.preferredIntegrations.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    const integrations = selected
                      ? data.preferredIntegrations.filter((c) => c !== opt.value)
                      : [...data.preferredIntegrations, opt.value];
                    setData({ ...data, preferredIntegrations: integrations });
                  }}
                  className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${
                    selected
                      ? 'border-orange-600 bg-orange-500/10 text-orange-400'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 4: Referral Source */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Megaphone className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">How did you hear about us?</h2>
            <p className="mt-2 text-sm text-zinc-500">This helps us reach more people like you.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            {REFERRAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setData({ ...data, referralSource: opt.value })}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  data.referralSource === opt.value
                    ? 'border-orange-600 bg-orange-500/10 text-orange-400'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-10 flex items-center justify-between">
        {step > 0 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={handleNext}
          disabled={!canContinue() || saving}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : step === STEPS.length - 1 ? (
            <>
              Complete Setup
              <Sparkles className="h-4 w-4" />
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
