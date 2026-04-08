import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================
// L1 - Hot Working Memory
// ============================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Timestamp;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolInvocation[];
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

// ============================================================
// L2 - Semantic Long-Term Memory
// ============================================================

export interface SemanticMemory {
  id: string;
  agentId: string;
  content: string;
  embedding: number[]; // 768-dim vector
  metadata: {
    source: 'conversation' | 'document' | 'episodic_promotion';
    confidence: number; // 0-1
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

// ============================================================
// L3 - Episodic Decision Log
// ============================================================

export interface ToolInvocation {
  toolId: string;
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  duration: number;
  status: 'success' | 'error';
  timestamp: Timestamp;
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

// ============================================================
// Normalized Message (Channel Adapter)
// ============================================================

export type ChannelSource = 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'web';

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  mimeType: string;
  size: number;
  name: string;
}

export interface NormalizedMessage {
  id: string;
  source: ChannelSource;
  userId: string;
  agentId: string;
  content: string;
  attachments: Attachment[];
  timestamp: Timestamp;
  replyTo?: string;
  metadata: Record<string, unknown>;
}

// ============================================================
// Agent Types
// ============================================================

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

// ============================================================
// Skill / MCP Types
// ============================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  trustScore: number;
  permissions: ('filesystem' | 'network' | 'exec' | 'db')[];
  sandboxConfig: {
    memoryLimitMB: number;
    timeoutMs: number;
    allowedHosts: string[];
  };
  mcpEndpoint: string;
  implementation: {
    storagePath: string;
    hash: string;
  };
  category: string;
  tags: string[];
  installCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ============================================================
// Audit Log
// ============================================================

export interface AuditLog {
  id: string;
  userId: string;
  agentId: string;
  action: string;
  skillId?: string;
  params?: Record<string, unknown>;
  resultHash?: string;
  status: 'success' | 'error';
  duration: number;
  timestamp: Timestamp;
  ipAddress?: string;
}

// ============================================================
// User
// ============================================================

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================
// Notification
// ============================================================

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

// ============================================================
// Request/Response Types
// ============================================================

export interface AgentRequest {
  message: NormalizedMessage;
  agent: Agent;
  conversationId: string;
  idempotencyKey: string;
}

export interface AgentResponse {
  messageId: string;
  content: string;
  toolCalls: ToolInvocation[];
  memoryUpdates: {
    workingMemoryUpdated: boolean;
    episodicLogged: boolean;
    semanticStaged: string[];
  };
  tokenUsage: {
    input: number;
    output: number;
  };
}

export interface StreamToken {
  conversationId: string;
  messageId: string;
  token: string;
  index: number;
  done: boolean;
  timestamp: Timestamp;
}
