'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { where, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useDesktopMcp } from '@/hooks/useDesktopMcp';
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection';
import { useAppStore } from '@/store';
import type { Agent, Conversation } from '@/types';
import {
  Bot,
  MessageSquare,
  Brain,
  Wrench,
  Clock,
  Settings,
  LogOut,
  Plus,
  Menu,
  Home,
  Zap,
  PanelLeftClose,
  PanelRightClose,
  ChevronDown,
  Loader2,
  Trash2,
  RefreshCw,
  Terminal,
  Download,
} from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';
import CreateAgentDialog from '@/components/chat/CreateAgentDialog';
import RightPanelContent from '@/components/dashboard/RightPanelContent';
import CommandsPanel from '@/components/dashboard/CommandsPanel';
import Tour from '@/components/tour/Tour';
import { updateDoc as fsUpdateDoc } from 'firebase/firestore';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  // Auto-register the desktop MCP server when running inside Electron
  useDesktopMcp();
  const router = useRouter();
  const pathname = usePathname();

  const {
    agents,
    setAgents,
    selectedAgentId,
    setSelectedAgentId,
    conversations,
    setConversations,
    selectedConversationId,
    setSelectedConversationId,
    sidebarOpen,
    setSidebarOpen,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
  } = useAppStore();

  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // Show tour on first visit (after onboarding) if tourCompleted is not set
  useEffect(() => {
    if (profile && profile.onboardingCompleted && !profile.tourCompleted) {
      // small delay so the layout has rendered before targeting elements
      const t = setTimeout(() => setShowTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [profile]);

  const handleTourComplete = async () => {
    setShowTour(false);
    if (user) {
      try {
        await fsUpdateDoc(doc(db, 'users', user.uid), { tourCompleted: true });
      } catch (err) {
        console.error('Failed to mark tour completed:', err);
      }
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
    }
  }, [authLoading, user, router]);

  // Redirect to onboarding if not completed (skip for existing users without the field)
  useEffect(() => {
    if (!authLoading && !profileLoading && user && profile && profile.onboardingCompleted === false) {
      router.replace('/onboarding');
    }
  }, [authLoading, profileLoading, user, profile, router]);

  // Load agents from Firestore
  const { data: agentsData, loading: agentsLoading } = useFirestoreCollection<Agent>(
    'agents',
    {
      constraints: user ? [where('ownerId', '==', user.uid), orderBy('createdAt', 'desc')] : [],
      enabled: !!user,
    }
  );

  // Sync agents to store
  useEffect(() => {
    if (agentsData) {
      setAgents(agentsData);
      // Auto-select first agent if none selected
      if (!selectedAgentId && agentsData.length > 0) {
        setSelectedAgentId(agentsData[0].id);
      }
    }
  }, [agentsData, setAgents, selectedAgentId, setSelectedAgentId]);

  // Load conversations for selected agent (subcollection under agent)
  const { data: conversationsData, loading: conversationsLoading } = useFirestoreCollection<Conversation>(
    selectedAgentId ? `agents/${selectedAgentId}/conversations` : '',
    {
      constraints: user
        ? [
            where('userId', '==', user.uid),
            orderBy('updatedAt', 'desc'),
          ]
        : [],
      enabled: !!selectedAgentId && !!user,
    }
  );

  // Sync conversations to store
  useEffect(() => {
    if (conversationsData) {
      setConversations(conversationsData);
    }
  }, [conversationsData, setConversations]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth/login');
  };

  const handleNewChat = () => {
    setSelectedConversationId(null);
  };

  const handleDeleteAgent = async (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const agentName = agents.find((a) => a.id === agentId)?.name || 'this agent';
    if (!confirm(`Delete "${agentName}"? This will permanently delete the agent AND all its conversations, messages, and memories.`)) return;
    try {
      // Call the cascade-delete Cloud Function to wipe all subcollections
      const functions = getFunctions(undefined, 'us-central1');
      const deleteAgentFn = httpsCallable(functions, 'deleteAgent');
      await deleteAgentFn({ agentId });

      if (selectedAgentId === agentId) {
        const remaining = agents.filter((a) => a.id !== agentId);
        setSelectedAgentId(remaining[0]?.id || null);
        setSelectedConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete agent:', err);
      alert(`Failed to delete agent: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRefreshChat = () => {
    if (!selectedConversationId) return;
    const id = selectedConversationId;
    setSelectedConversationId(null);
    // Re-select on next tick to force the listener to re-mount
    setTimeout(() => setSelectedConversationId(id), 50);
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedAgentId) return;
    try {
      await deleteDoc(doc(db, 'agents', selectedAgentId, 'conversations', convId));
      if (selectedConversationId === convId) {
        setSelectedConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-zinc-800 bg-zinc-950 transition-transform duration-200 lg:relative lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0'
        }`}
      >
        {/* User section — extra top padding for macOS traffic lights */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 pb-3 pt-10">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-xs font-bold text-white">
            {(profile?.displayName || user.displayName || user.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-200">
              {profile?.displayName || user.displayName || user.email?.split('@')[0] || 'User'}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {user.email}
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 lg:hidden"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {/* Agent selector */}
        <div data-tour="agents" className="border-b border-zinc-800 px-3 py-3">
          <div className="mb-1.5 flex items-center gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Agent</span>
            <HelpTooltip text="Select which AI agent to work with. Each agent has its own memory, skills, and conversation history." />
          </div>
          <div className="relative">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-700"
            >
              <Bot className="h-4 w-4 shrink-0 text-orange-400" />
              <span className="min-w-0 flex-1 truncate text-left">
                {agentsLoading ? 'Loading...' : selectedAgent?.name || 'Select Agent'}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${agentDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {agentDropdownOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`group flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 cursor-pointer ${
                      agent.id === selectedAgentId
                        ? 'text-orange-400'
                        : 'text-zinc-300'
                    }`}
                    onClick={() => {
                      setSelectedAgentId(agent.id);
                      setSelectedConversationId(null);
                      setAgentDropdownOpen(false);
                    }}
                  >
                    <Bot className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                    <button
                      onClick={(e) => handleDeleteAgent(agent.id, e)}
                      className="hidden shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-red-400 group-hover:block"
                      title="Delete agent"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-zinc-800 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setAgentDropdownOpen(false);
                      setShowCreateAgent(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-orange-400 transition-colors hover:bg-zinc-800"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span>New Agent</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* New Chat button */}
        <div className="px-3 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewChat}
              disabled={!selectedAgentId}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
            <HelpTooltip text="Start a fresh conversation with the selected agent. Previous conversations are saved in the list below." />
          </div>
        </div>

        {/* Conversation list */}
        <div data-tour="conversations" className="flex-1 overflow-y-auto px-2">
          {conversationsLoading ? (
            <div className="space-y-2 px-1 py-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-900" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-600">
              {selectedAgentId ? 'No conversations yet' : 'Select an agent to begin'}
            </p>
          ) : (
            <div className="space-y-0.5 py-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                    conv.id === selectedConversationId
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                  onClick={() => handleSelectConversation(conv.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="hidden shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-red-400 group-hover:block"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation links */}
        <nav className="border-t border-zinc-800 px-2 py-2">
          <NavLink icon={Home} label="Home" href="/dashboard" active={pathname === '/dashboard'} />
          <NavLink icon={Zap} label="Auto-pilot" href="/dashboard/goals" active={pathname === '/dashboard/goals'} />
          <NavLink icon={Brain} label="Memory Explorer" href="/dashboard/memory" active={pathname === '/dashboard/memory'} />
          <NavLink icon={Wrench} label="Skill Marketplace" href="/dashboard/skills" active={pathname === '/dashboard/skills'} />
          <NavLink icon={Settings} label="Settings" href="/dashboard/settings" active={pathname === '/dashboard/settings'} />
          <NavLink icon={Download} label="Get Desktop App" href="/download" active={false} highlight />
        </nav>

        {/* Sign out */}
        <div className="border-t border-zinc-800 px-2 py-2">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Center content area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar for mobile */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex-1 truncate text-sm font-medium text-zinc-200">
            {selectedAgent?.name || 'Noomachy'}
          </span>
          {selectedConversationId && (
            <button
              onClick={handleRefreshChat}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              title="Refresh chat"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <PanelRightClose className="h-5 w-5" />
          </button>
        </div>

        {/* Desktop top bar with panel toggle */}
        <div className="hidden items-center justify-between border-b border-zinc-800 px-4 py-2 lg:flex">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <PanelLeftClose className={`h-4 w-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-300">
              {selectedAgent?.name || 'Noomachy'}
            </span>
            {selectedConversationId && (
              <button
                onClick={handleRefreshChat}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                title="Refresh chat"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            title={rightPanelOpen ? 'Collapse panel' : 'Expand panel'}
          >
            <PanelRightClose className={`h-4 w-4 transition-transform ${rightPanelOpen ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Mobile right panel overlay */}
      {rightPanelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setRightPanelOpen(false)}
        />
      )}

      {/* Right Panel */}
      <aside
        data-tour="right-panel"
        className={`fixed inset-y-0 right-0 z-40 flex w-[320px] flex-col border-l border-zinc-800 bg-zinc-950 transition-transform duration-200 lg:relative lg:z-auto ${
          rightPanelOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0'
        }`}
      >
        {/* Tab bar */}
        <div className="flex border-b border-zinc-800">
          <RightPanelTab
            active={rightPanelTab === 'commands'}
            icon={Terminal}
            label="Commands"
            onClick={() => setRightPanelTab('commands')}
            help="Slash commands you can run from the chat input."
          />
          <RightPanelTab
            active={rightPanelTab === 'memory'}
            icon={Brain}
            label="Memory"
            onClick={() => setRightPanelTab('memory')}
            help="Visualize the agent's memory nodes and connections."
          />
          <RightPanelTab
            active={rightPanelTab === 'tools'}
            icon={Wrench}
            label="Tools"
            onClick={() => setRightPanelTab('tools')}
            help="See which tools and skills the agent used in this session."
          />
          <RightPanelTab
            active={rightPanelTab === 'timeline'}
            icon={Clock}
            label="Timeline"
            onClick={() => setRightPanelTab('timeline')}
            help="Follow the chronological sequence of agent actions."
          />
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {rightPanelTab === 'commands' ? (
            <CommandsPanel />
          ) : (
            <RightPanelContent
              tab={rightPanelTab}
              agentId={selectedAgentId}
              conversationId={selectedConversationId}
            />
          )}
        </div>
      </aside>

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        open={showCreateAgent}
        onClose={() => setShowCreateAgent(false)}
        onCreated={(agentId) => {
          setSelectedAgentId(agentId);
          setSelectedConversationId(null);
        }}
      />

      {/* First-visit guided tour */}
      {showTour && <Tour onComplete={handleTourComplete} />}
    </div>
  );
}

/* ---- Helper components ---- */

function NavLink({
  icon: Icon,
  label,
  href,
  active,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-orange-500/10 text-orange-400'
          : highlight
          ? 'border border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-orange-600/5 text-orange-400 hover:from-orange-500/15 hover:to-orange-600/10'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

function RightPanelTab({
  active,
  icon: Icon,
  label,
  onClick,
  help,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  help?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors ${
        active
          ? 'border-orange-500 text-orange-400'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden xl:inline">{label}</span>
      {help && (
        <span className="pointer-events-none absolute -bottom-12 left-1/2 z-50 hidden w-48 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-[10px] leading-snug text-zinc-300 shadow-xl group-hover:block">
          {help}
        </span>
      )}
    </button>
  );
}
