/**
 * Firestore's Timestamp is gone with Firebase. The API serialises times as
 * ISO-8601 strings; this alias keeps the many `Timestamp`-typed fields below
 * compiling while they are migrated one screen at a time.
 */
export type Timestamp = string;

// Mirror of server types for client use

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Timestamp;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolInvocation[];
}

export interface ToolInvocation {
  toolId: string;
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  duration: number;
  status: 'success' | 'error';
  timestamp: Timestamp;
}

export interface WorkingMemory {
  sessionId: string;
  agentId: string;
  userId: string;
  contextWindow: Message[];
  activeTools: string[];
  tempVariables: Record<string, unknown>;
  ttl: Timestamp;
  deviceId: string;
  syncStatus: 'local' | 'synced' | 'conflict';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SemanticMemory {
  id: string;
  agentId: string;
  content: string;
  embedding: number[];
  metadata: {
    source: 'conversation' | 'document' | 'episodic_promotion';
    confidence: number;
    validationStatus: 'staging' | 'approved' | 'rejected';
    tags: string[];
    createdAt: Timestamp;
    lastAccessed: Timestamp;
    accessCount: number;
  };
  accessControl: {
    ownerId: string;
    visibility: 'private' | 'shared' | 'public';
    allowedUsers: string[];
  };
}

export interface StagingMemory extends SemanticMemory {
  proposedBy: 'agent' | 'user';
  explanation: string;
  duplicateCheckResult?: {
    hasDuplicate: boolean;
    similarMemoryId?: string;
    similarityScore?: number;
  };
  contradictionCheckResult?: {
    hasContradiction: boolean;
    conflictingMemoryId?: string;
    explanation?: string;
  };
  autoApprovalEligible: boolean;
  autoApprovalReason?: string;
}

export interface EpisodicMemory {
  episodeId: string;
  agentId: string;
  userId: string;
  taskDomain: string;
  sessionSnapshot: {
    sessionId: string;
    messageCount: number;
    toolsUsed: string[];
    summary: string;
  };
  outcome: 'success' | 'failure' | 'partial';
  lessonsLearned: string[];
  toolCalls: ToolInvocation[];
  duration: number;
  consolidationScore: number;
  promotedToSemantic: boolean;
  createdAt: Timestamp;
}

// Other channels (telegram/discord/slack) are deferred per ROADMAP.
export type ChannelSource = 'web';
export type AgentType = 'general' | 'code' | 'research' | 'creative' | 'planning';

/**
 * Agent and Conversation are now defined by the API. Re-exported here so the
 * many `import type { Agent } from '@/types'` call sites keep working against
 * a single definition rather than a stale Firestore-shaped copy.
 */
export type { Agent, Conversation } from '@/lib/api';


export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  trustScore: number;
  permissions: ('filesystem' | 'network' | 'exec' | 'db')[];
  category: string;
  tags: string[];
  installCount: number;
}

export interface Notification {
  id: string;
  /** Server column is `kind`; `type` is kept as an alias for existing UI. */
  kind: string;
  type?: 'memory_validation' | 'agent_error' | 'skill_update' | 'system';
  title: string;
  body: string | null;
  link?: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface StreamToken {
  conversationId: string;
  messageId: string;
  token: string;
  index: number;
  done: boolean;
  timestamp: Timestamp;
}

export type ReferralSource =
  | 'linkedin'
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'kodefoundry'
  | 'web_search'
  | 'referral'
  | 'reference'
  | 'tiktok'
  | 'other';

export type PrimaryUse =
  | 'personal_assistant'
  | 'coding'
  | 'research'
  | 'creative_writing'
  | 'business';

export type AiExperience = 'beginner' | 'intermediate' | 'expert';

export type WorkContext = 'student' | 'individual' | 'startup' | 'small_team' | 'enterprise';

export type CommunicationStyle = 'concise' | 'detailed' | 'casual' | 'formal';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan: 'free' | 'pro' | 'enterprise';
  agentLimit: number;
  apiUsage: {
    tokensUsed: number;
    tokensLimit: number;
    resetAt: Timestamp;
  };
  onboardingCompleted: boolean;
  tourCompleted?: boolean;
  onboarding?: {
    role?: string;
    workContext?: WorkContext;
    primaryUse?: PrimaryUse;
    goals?: string[];
    aiExperience?: AiExperience;
    communicationStyle?: CommunicationStyle;
    preferredIntegrations?: ChannelSource[];
    timezone?: string;
    referralSource?: ReferralSource;
    completedAt?: Timestamp;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Graph visualization types
export interface MemoryNode {
  id: string;
  content: string;
  tags: string[];
  confidence: number;
  source: string;
  x?: number;
  y?: number;
}

export interface MemoryLink {
  source: string;
  target: string;
  similarity: number;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  links: MemoryLink[];
}

// ============================================================
// Auto-Pilot Goals
// ============================================================

export type GoalStatus = 'active' | 'paused' | 'completed' | 'error';

export interface Goal {
  id: string;
  ownerId: string;
  agentId: string;
  title: string;
  prompt: string;
  schedule: string;
  timezone?: string;
  status: GoalStatus;
  nextRunAt: Timestamp;
  lastRunAt?: Timestamp;
  lastResult?: {
    summary: string;
    error?: string;
    runId: string;
    finishedAt: Timestamp;
  };
  runCount: number;
  errorCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: 'user' | 'agent';
}
