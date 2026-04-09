import { create } from 'zustand';
import type { Agent, Conversation, Message, SemanticMemory, StagingMemory, Notification } from '@/types';

interface AppState {
  // Auth
  userId: string | null;
  setUserId: (uid: string | null) => void;

  // Agents
  agents: Agent[];
  selectedAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  setSelectedAgentId: (id: string | null) => void;

  // Conversations
  conversations: Conversation[];
  selectedConversationId: string | null;
  setConversations: (conversations: Conversation[]) => void;
  setSelectedConversationId: (id: string | null) => void;

  // Messages
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;

  // Streaming
  streamingContent: string;
  isStreaming: boolean;
  setStreamingContent: (content: string) => void;
  setIsStreaming: (streaming: boolean) => void;

  // Memory
  semanticMemories: SemanticMemory[];
  stagingMemories: StagingMemory[];
  setSemanticMemories: (memories: SemanticMemory[]) => void;
  setStagingMemories: (memories: StagingMemory[]) => void;

  // Notifications
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  setUnreadCount: (count: number) => void;

  // UI State
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelTab: 'memory' | 'tools' | 'timeline';
  setSidebarOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: 'memory' | 'tools' | 'timeline') => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  userId: null,
  setUserId: (uid) => set({ userId: uid }),

  // Agents
  agents: [],
  selectedAgentId: null,
  setAgents: (agents) => set({ agents }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  // Conversations
  conversations: [],
  selectedConversationId: null,
  setConversations: (conversations) => set({ conversations }),
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),

  // Messages
  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  // Streaming
  streamingContent: '',
  isStreaming: false,
  setStreamingContent: (content) => set({ streamingContent: content }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),

  // Memory
  semanticMemories: [],
  stagingMemories: [],
  setSemanticMemories: (memories) => set({ semanticMemories: memories }),
  setStagingMemories: (memories) => set({ stagingMemories: memories }),

  // Notifications
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (count) => set({ unreadCount: count }),

  // UI State
  sidebarOpen: true,
  rightPanelOpen: true,
  rightPanelTab: 'memory',
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
}));
