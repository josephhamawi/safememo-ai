'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { agents as agentsApi, profile as profileApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
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
  GraduationCap,
  Building2,
  Building,
  Users,
  Target,
  MessageSquare,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type {
  PrimaryUse,
  AiExperience,
  ReferralSource,
  WorkContext,
  CommunicationStyle,
} from '@/types';

const STEPS = [
  'About You',
  'Your Context',
  'Primary Use',
  'Your Goals',
  'AI Experience',
  'Style',
  'How You Found Us',
];

interface OnboardingData {
  name: string;
  role: string;
  workContext: WorkContext | null;
  primaryUse: PrimaryUse | null;
  goals: string[];
  aiExperience: AiExperience | null;
  communicationStyle: CommunicationStyle | null;
  timezone: string;
  referralSource: ReferralSource | null;
}

const WORK_CONTEXT_OPTIONS: { value: WorkContext; label: string; icon: React.ElementType }[] = [
  { value: 'student', label: 'Student', icon: GraduationCap },
  { value: 'individual', label: 'Solo Professional', icon: User },
  { value: 'startup', label: 'Startup', icon: Sparkles },
  { value: 'small_team', label: 'Small Team', icon: Users },
  { value: 'enterprise', label: 'Enterprise', icon: Building2 },
];

const PRIMARY_USE_OPTIONS: { value: PrimaryUse; label: string; description: string; icon: React.ElementType }[] = [
  { value: 'personal_assistant', label: 'Personal Assistant', description: 'Daily tasks, scheduling, email triage', icon: Sparkles },
  { value: 'coding', label: 'Coding', description: 'Write, review, and debug code', icon: Code },
  { value: 'research', label: 'Research', description: 'Deep research and analysis', icon: Search },
  { value: 'creative_writing', label: 'Creative Writing', description: 'Stories, content, copywriting', icon: Palette },
  { value: 'business', label: 'Business', description: 'Strategy, planning, analytics', icon: BarChart3 },
];

const GOAL_OPTIONS = [
  'Save time on daily tasks',
  'Manage my email better',
  'Stay on top of my calendar',
  'Get better at writing',
  'Learn new things faster',
  'Automate repetitive work',
  'Improve productivity',
  'Build something with AI',
  'Reduce mental clutter',
  'Stay organized',
];

const EXPERIENCE_OPTIONS: { value: AiExperience; label: string; description: string }[] = [
  { value: 'beginner', label: 'Beginner', description: "I'm just getting started with AI" },
  { value: 'intermediate', label: 'Intermediate', description: "I've used ChatGPT and similar tools" },
  { value: 'expert', label: 'Expert', description: "I've built AI systems or agents before" },
];

const STYLE_OPTIONS: { value: CommunicationStyle; label: string; description: string }[] = [
  { value: 'concise', label: 'Concise', description: 'Short, to the point' },
  { value: 'detailed', label: 'Detailed', description: 'In-depth, with context' },
  { value: 'casual', label: 'Casual', description: 'Friendly and conversational' },
  { value: 'formal', label: 'Formal', description: 'Professional tone' },
];

const REFERRAL_OPTIONS: { value: ReferralSource; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'kodefoundry', label: 'KodeFoundry' },
  { value: 'web_search', label: 'Web Search' },
  { value: 'referral', label: 'Referral' },
  { value: 'reference', label: 'Reference' },
  { value: 'tiktok', label: 'TikTok' },
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

  // Auto-detect timezone
  const detectedTimezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  })();

  const { user } = useAuth();

  const [data, setData] = useState<OnboardingData>({
    name: user?.displayName || '',
    role: '',
    workContext: null,
    primaryUse: null,
    goals: [],
    aiExperience: null,
    communicationStyle: null,
    timezone: detectedTimezone,
    referralSource: null,
  });

  const canContinue = () => {
    switch (step) {
      case 0: return data.name.trim().length > 0;
      case 1: return data.workContext !== null;
      case 2: return data.primaryUse !== null;
      case 3: return data.goals.length > 0;
      case 4: return data.aiExperience !== null;
      case 5: return data.communicationStyle !== null;
      case 6: return data.referralSource !== null;
      default: return false;
    }
  };

  const toggleGoal = (goal: string) => {
    setData((d) => ({
      ...d,
      goals: d.goals.includes(goal)
        ? d.goals.filter((g) => g !== goal)
        : [...d.goals, goal],
    }));
  };

  const handleComplete = async () => {
    if (!user || !data.primaryUse) return;

    setSaving(true);
    try {
      await profileApi.update({
        displayName: data.name.trim() || null,
        onboardingCompleted: true,
        preferences: {
          role: data.role.trim() || null,
          workContext: data.workContext,
          primaryUse: data.primaryUse,
          goals: data.goals,
          aiExperience: data.aiExperience,
          communicationStyle: data.communicationStyle,
          timezone: data.timezone,
          referralSource: data.referralSource,
          completedAt: new Date().toISOString(),
        },
      });

      const agentConfig = USE_TO_AGENT_TYPE[data.primaryUse];

      const personalizedPrompt = `${agentConfig.prompt}

USER PROFILE:
- Name: ${data.name.trim()}
${data.role ? `- Role: ${data.role.trim()}` : ''}
- Context: ${WORK_CONTEXT_OPTIONS.find((w) => w.value === data.workContext)?.label}
- Communication style: ${data.communicationStyle}
- Goals: ${data.goals.join(', ')}
- Timezone: ${data.timezone}

Respond in a ${data.communicationStyle} style. Adapt to these preferences naturally.`;

      await agentsApi.create({
        name: agentConfig.name,
        systemPrompt: personalizedPrompt,
        maxTokens: 4096,
      });

      router.replace('/dashboard');
    } catch (err) {
      // Agent creation fails with 409 when no provider key is stored yet.
      // The profile update already succeeded, so send them to key setup
      // rather than stranding them on the last onboarding step.
      console.error('Onboarding error:', err);
      router.replace('/onboarding/api-key');
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
    <div className="w-full max-w-2xl">
      {/* Progress dots */}
      <div className="mb-8 flex items-center justify-center gap-1.5">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                i < step
                  ? 'w-5 bg-orange-500'
                  : i === step
                  ? 'w-10 bg-orange-500'
                  : 'w-5 bg-zinc-800'
              }`}
            />
          </div>
        ))}
      </div>

      <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </div>

      {/* Step 0: Name & Role */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <User className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Welcome! Let&apos;s get to know you</h2>
            <p className="mt-2 text-sm text-zinc-500">A few quick questions so we can personalize your experience.</p>
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
              What&apos;s your role or what do you do?
            </label>
            <input
              type="text"
              value={data.role}
              onChange={(e) => setData({ ...data, role: e.target.value })}
              placeholder="e.g. Software Engineer, Founder, Student, Marketer"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>
        </div>
      )}

      {/* Step 1: Work Context */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Building className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">What&apos;s your context?</h2>
            <p className="mt-2 text-sm text-zinc-500">This helps us tailor recommendations to your situation.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {WORK_CONTEXT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setData({ ...data, workContext: opt.value })}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                  data.workContext === opt.value
                    ? 'border-orange-600 bg-orange-500/5'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <opt.icon className={`h-6 w-6 ${data.workContext === opt.value ? 'text-orange-400' : 'text-zinc-400'}`} />
                <span className="text-sm font-medium text-zinc-100">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Primary Use */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Briefcase className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">What will you use SafeMemo AI for?</h2>
            <p className="mt-2 text-sm text-zinc-500">We&apos;ll pre-configure your first agent based on this.</p>
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

      {/* Step 3: Goals */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Target className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">What are your goals?</h2>
            <p className="mt-2 text-sm text-zinc-500">Pick all that apply — your agent will focus on these.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GOAL_OPTIONS.map((goal) => {
              const selected = data.goals.includes(goal);
              return (
                <button
                  key={goal}
                  onClick={() => toggleGoal(goal)}
                  className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? 'border-orange-600 bg-orange-500/10 text-orange-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {selected ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-400" />
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded-full border border-zinc-700" />
                  )}
                  <span>{goal}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 4: AI Experience */}
      {step === 4 && (
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

      {/* Step 5: Style */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <MessageSquare className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">Communication preferences</h2>
            <p className="mt-2 text-sm text-zinc-500">How should your agent talk to you?</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Communication style
            </p>
            <div className="grid grid-cols-2 gap-2">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setData({ ...data, communicationStyle: opt.value })}
                  className={`flex flex-col rounded-lg border p-3 text-left transition-colors ${
                    data.communicationStyle === opt.value
                      ? 'border-orange-600 bg-orange-500/5'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-sm font-medium text-zinc-100">{opt.label}</span>
                  <span className="mt-0.5 text-xs text-zinc-500">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Clock className="mr-1 inline h-3 w-3" /> Timezone (auto-detected)
            </p>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              {data.timezone}
            </div>
          </div>
        </div>
      )}

      {/* Step 6: Referral Source */}
      {step === 6 && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Megaphone className="h-7 w-7 text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">How did you hear about us?</h2>
            <p className="mt-2 text-sm text-zinc-500">Help us know where to find more people like you.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REFERRAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setData({ ...data, referralSource: opt.value })}
                className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
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
