import { Timestamp } from 'firebase/firestore';

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

export type ChannelSource = 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'web';
export type AgentType = 'general' | 'code' | 'research' | 'creative' | 'planning';

export interface Agent {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  type: AgentType;
  systemPrompt: string;
  model: 'claude' | 'gemini';
  modelConfig: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };
  enabledSkills: string[];
  memoryConfig: {
    maxWorkingMemoryMessages: number;
    semanticSearchTopK: number;
    episodicSearchTopK: number;
    autoApprovalEnabled: boolean;
    autoApprovalThreshold: number;
  };
  channels: {
    telegram?: { chatId: string; enabled: boolean };
    discord?: { channelId: string; enabled: boolean };
    slack?: { channelId: string; enabled: boolean };
    whatsapp?: { phoneNumber: string; enabled: boolean };
    web: { enabled: boolean };
  };
  status: 'active' | 'paused' | 'archived';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Conversation {
  id: string;
  agentId: string;
  userId: string;
  title: string;
  source: ChannelSource;
  messageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

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
  userId: string;
  type: 'memory_validation' | 'agent_error' | 'skill_update' | 'system';
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
