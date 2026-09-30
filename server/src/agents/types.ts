import type { ProviderId } from '../providers/registry';

export interface AgentConfig {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string | null;
  provider: ProviderId;
  model: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null;
}

export interface SemanticMemoryRef {
  id: string;
  content: string;
  confidence: number | null;
  tags: string[];
}

export interface EpisodicMemoryRef {
  id: string;
  summary: string;
  createdAt: Date;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemoryContext {
  semantic: SemanticMemoryRef[];
  episodic: EpisodicMemoryRef[];
  working: TranscriptMessage[];
}

export interface ToolInvocation {
  toolId: string;
  toolName: string;
  params: Record<string, unknown>;
  result: string;
  durationMs: number;
  status: 'success' | 'error';
}

export interface AgentRunResult {
  messageId: string;
  content: string;
  toolCalls: ToolInvocation[];
  stagedMemoryIds: string[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: 'end_turn' | 'max_iterations' | 'refusal' | 'max_tokens';
  durationMs: number;
}

/** Emitted to the caller as the run progresses. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolName: string; toolId: string }
  | { type: 'tool_end'; toolName: string; toolId: string; status: 'success' | 'error' }
  | { type: 'done'; result: AgentRunResult }
  | { type: 'error'; message: string };

export type EventSink = (event: AgentEvent) => void;
