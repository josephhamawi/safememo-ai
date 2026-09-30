/**
 * Client for the self-hosted SafeMemo AI API.
 *
 * Authentication is a HttpOnly session cookie set by the server, so every
 * request opts into credentials and no token is ever handled in JavaScript.
 * That is the point: a token this code could read is a token an XSS payload
 * could read.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export type ProviderId = 'anthropic' | 'google' | 'openai';

export interface Provider {
  id: ProviderId;
  label: string;
  consoleUrl: string;
  formatHint: string;
  defaultModel: string;
  supportsEmbeddings: boolean;
}

export interface Credential {
  id: string;
  provider: ProviderId;
  label: string | null;
  keyLast4: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the API running?');
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? `Request failed (${response.status})`,
      body?.reason,
    );
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
  signup: (input: { email: string; password: string; displayName?: string }) =>
    request<{ user: SessionUser; needsApiKey: boolean }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<{ user: SessionUser; needsApiKey: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: SessionUser; needsApiKey: boolean }>('/auth/me'),
};

// ---------------------------------------------------------------------------
// Provider credentials
// ---------------------------------------------------------------------------

export const credentials = {
  providers: () =>
    request<{ providers: Provider[] }>('/credentials/providers').then(
      (r) => r.providers,
    ),

  list: () =>
    request<{ credentials: Credential[] }>('/credentials').then(
      (r) => r.credentials,
    ),

  /**
   * Save a key. The server verifies it against the provider before storing,
   * so a resolved promise means the key actually works.
   */
  save: (input: { provider: ProviderId; apiKey: string; label?: string }) =>
    request<{ credential: Credential; replaced: boolean }>('/credentials', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  remove: (provider: ProviderId) =>
    request<void>(`/credentials/${provider}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Agents and conversations
// ---------------------------------------------------------------------------

export interface Agent {
  id: string;
  name: string;
  systemPrompt: string | null;
  provider: ProviderId;
  model: string;
  maxTokens: number;
  effort: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolInvocation {
  toolId: string;
  toolName: string;
  params: Record<string, unknown>;
  result: string;
  durationMs: number;
  status: 'success' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ToolInvocation[];
  createdAt: string;
}

export const agents = {
  list: () => request<{ agents: Agent[] }>('/agents').then((r) => r.agents),
  get: (id: string) => request<{ agent: Agent }>(`/agents/${id}`).then((r) => r.agent),
  create: (input: {
    name: string;
    systemPrompt?: string;
    provider?: ProviderId;
    model?: string;
    maxTokens?: number;
    effort?: string;
  }) =>
    request<{ agent: Agent }>('/agents', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => r.agent),
  update: (id: string, input: Partial<Agent>) =>
    request<{ agent: Agent }>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }).then((r) => r.agent),
  archive: (id: string) => request<void>(`/agents/${id}`, { method: 'DELETE' }),
  conversations: (id: string) =>
    request<{ conversations: Conversation[] }>(`/agents/${id}/conversations`).then(
      (r) => r.conversations,
    ),
};

export const conversations = {
  messages: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/conversations/${id}/messages`).then(
      (r) => r.messages,
    ),
};

// ---------------------------------------------------------------------------
// Memory and validation
// ---------------------------------------------------------------------------

export interface Memory {
  id: string;
  agentId?: string;
  content: string;
  tags?: string[];
  confidence: number | null;
  source?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
}

/** Validation-gate findings, stored in the `flags` jsonb column. */
export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  similarityScore?: number;
  similarMemoryId?: string;
}

export interface ContradictionCheckResult {
  hasContradiction: boolean;
  explanation?: string;
  conflictingMemoryId?: string;
}

export interface PendingMemory {
  id: string;
  agentId: string;
  content: string;
  tags: string[];
  confidence: number | null;
  source: string | null;
  flags: unknown;
  /** Populated by the validation gate once dedup runs. */
  duplicateCheckResult?: DuplicateCheckResult;
  contradictionCheckResult?: ContradictionCheckResult;
  /** Set when the gate judged this safe to auto-approve. */
  autoApprovalEligible?: boolean;
  autoApprovalReason?: string;
  createdAt: string;
}

export interface Episode {
  id: string;
  /** Alias of `id`, kept for the explorer's existing markup. */
  episodeId: string;
  agentId: string;
  summary: string;
  taskDomain: string;
  outcome: 'success' | 'partial';
  duration: number;
  lessonsLearned: string[];
  toolCalls: Array<{ toolName: string }>;
  sessionSnapshot: {
    summary: string;
    sessionId: string | null;
    toolsUsed: string[];
    messageCount: number;
  };
  detail: {
    conversationId?: string;
    toolsUsed?: string[];
    stopReason?: string;
    durationMs?: number;
  };
  createdAt: string;
}

export const memories = {
  list: (params: { agentId?: string; search?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.agentId) qs.set('agentId', params.agentId);
    if (params.search) qs.set('search', params.search);
    if (params.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ memories: Memory[] }>(`/memories${suffix}`).then((r) => r.memories);
  },
  episodic: (agentId?: string) =>
    request<{ episodes: Episode[] }>(
      `/memories/episodic${agentId ? `?agentId=${agentId}` : ''}`,
    ).then((r) => r.episodes),
  purge: (id: string) => request<void>(`/memories/${id}`, { method: 'DELETE' }),
  exportUrl: () => `${API_BASE}/memories/export`,
};

export const validation = {
  pending: () =>
    request<{ pending: PendingMemory[] }>('/validation').then((r) => r.pending),
  decide: (id: string, decision: 'approve' | 'reject', reason?: string) =>
    request<{ ok: true; promotedId: string | null }>(`/validation/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, ...(reason ? { reason } : {}) }),
    }),
};

export interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  prevHash: string | null;
  entryHash: string;
  createdAt: string;
}

export interface ChainVerification {
  valid: boolean;
  entries: number;
  brokenAt?: string;
}

export const audit = {
  chain: (chainKey: string) =>
    request<{ chainKey: string; entries: AuditEntry[] }>(`/audit/${chainKey}`),
  verify: (chainKey: string) =>
    request<ChainVerification>(`/audit/${chainKey}/verify`),
  share: (chainKey: string, ttlDays = 7) =>
    request<{ token: string; expiresAt: string }>('/audit/share', {
      method: 'POST',
      body: JSON.stringify({ chainKey, ttlDays }),
    }),
  /** Public: resolves a share token without a session. */
  viewShared: (token: string) =>
    request<{
      chainKey: string;
      expiresAt: string;
      verification: ChainVerification;
      entries: AuditEntry[];
    }>(`/audit/share/view?token=${encodeURIComponent(token)}`),
};

// ---------------------------------------------------------------------------
// Notifications, commands, profile, usage
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export const notifications = {
  list: () =>
    request<{ notifications: Notification[]; unreadCount: number }>('/notifications'),
  markRead: (id: string) =>
    request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
};

export interface CustomCommand {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
}

export const commands = {
  list: () =>
    request<{ commands: CustomCommand[] }>('/commands').then((r) => r.commands),
  save: (input: { name: string; description?: string; prompt: string }) =>
    request<{ id: string; name: string }>('/commands', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  remove: (name: string) =>
    request<void>(`/commands/${encodeURIComponent(name)}`, { method: 'DELETE' }),
};

export interface Usage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  limit: number;
  remaining: number;
}

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  onboardingCompleted: boolean;
  preferences: Record<string, unknown>;
  createdAt: string;
}

export const profile = {
  get: () => request<{ profile: Profile; usage: Usage }>('/profile'),
  update: (input: {
    displayName?: string | null;
    onboardingCompleted?: boolean;
    preferences?: Record<string, unknown>;
  }) =>
    request<void>('/profile', { method: 'PATCH', body: JSON.stringify(input) }),
};

export const usage = {
  today: () => request<Usage>('/usage/today'),
};

export const earlyAccess = {
  submit: (input: {
    email: string;
    name?: string;
    organization?: string;
    useCase?: string;
  }) =>
    request<{ ok: true }>('/early-access', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

export type AgentStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; toolName: string; toolId: string }
  | { type: 'tool_end'; toolName: string; toolId: string; status: 'success' | 'error' }
  | { type: 'done'; result: { content: string; messageId: string } }
  | { type: 'error'; message: string };

/**
 * POST a message and consume the SSE response.
 *
 * EventSource cannot POST or send credentials cross-origin, so the stream is
 * read off the fetch body directly.
 */
export async function streamChat(
  input: { agentId: string; conversationId: string; message: string },
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error ?? 'Chat request failed');
  }
  if (!response.body) throw new ApiError(0, 'No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line. Anything after the last
    // separator is a partial frame and stays buffered.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue; // skip ': ping' heartbeats
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as AgentStreamEvent);
        } catch {
          // A malformed frame should not kill the stream.
        }
      }
    }
  }
}
