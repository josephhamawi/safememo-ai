'use client';

import { useState, useMemo } from 'react';
import { where, orderBy, deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection';
import { useAppStore } from '@/store';
import type { SemanticMemory, EpisodicMemory, WorkingMemory } from '@/types';
import {
  Brain,
  Clock,
  Cpu,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  Tag,
  Loader2,
  AlertCircle,
  Inbox,
  Shield,
  Eye,
  Hash,
} from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';

type TabKey = 'semantic' | 'episodic' | 'working';

const TABS: { key: TabKey; label: string; sublabel: string; icon: typeof Brain; help: string }[] = [
  { key: 'semantic', label: 'Semantic', sublabel: 'L2', icon: Brain, help: 'Long-term factual knowledge extracted from conversations. Validated before saving.' },
  { key: 'episodic', label: 'Episodic', sublabel: 'L3', icon: Clock, help: 'Records of past conversations and decisions with outcomes and lessons learned.' },
  { key: 'working', label: 'Working', sublabel: 'L1', icon: Cpu, help: 'Current session context. Resets after 24 hours of inactivity.' },
];

const OUTCOME_COLORS: Record<string, string> = {
  success: 'text-green-400 bg-green-400/10',
  failure: 'text-red-400 bg-red-400/10',
  partial: 'text-yellow-400 bg-yellow-400/10',
};

export default function MemoryExplorer() {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const [activeTab, setActiveTab] = useState<TabKey>('semantic');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Data fetching
  const {
    data: semanticMemories,
    loading: semanticLoading,
    error: semanticError,
  } = useFirestoreCollection<SemanticMemory>(
    selectedAgentId ? `agents/${selectedAgentId}/semanticMemory` : '',
    {
      constraints: [where('metadata.validationStatus', '==', 'approved')],
      enabled: !!selectedAgentId && activeTab === 'semantic',
    }
  );

  const {
    data: episodicMemories,
    loading: episodicLoading,
    error: episodicError,
  } = useFirestoreCollection<EpisodicMemory>(
    selectedAgentId ? `agents/${selectedAgentId}/episodicMemory` : '',
    {
      constraints: [orderBy('createdAt', 'desc')],
      enabled: !!selectedAgentId && activeTab === 'episodic',
    }
  );

  const {
    data: workingMemories,
    loading: workingLoading,
    error: workingError,
  } = useFirestoreCollection<WorkingMemory>(
    selectedAgentId ? `agents/${selectedAgentId}/workingMemory` : '',
    {
      enabled: !!selectedAgentId && activeTab === 'working',
    }
  );

  // Derived values
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    semanticMemories.forEach((m) => m.metadata.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [semanticMemories]);

  const allDomains = useMemo(() => {
    const domains = new Set<string>();
    episodicMemories.forEach((m) => domains.add(m.taskDomain));
    return Array.from(domains).sort();
  }, [episodicMemories]);

  const filteredSemantic = useMemo(() => {
    let items = semanticMemories;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.metadata.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (tagFilter) {
      items = items.filter((m) => m.metadata.tags.includes(tagFilter));
    }
    return items;
  }, [semanticMemories, search, tagFilter]);

  const filteredEpisodic = useMemo(() => {
    let items = episodicMemories;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          m.sessionSnapshot.summary.toLowerCase().includes(q) ||
          m.taskDomain.toLowerCase().includes(q) ||
          m.lessonsLearned.some((l) => l.toLowerCase().includes(q))
      );
    }
    if (domainFilter) {
      items = items.filter((m) => m.taskDomain === domainFilter);
    }
    return items;
  }, [episodicMemories, search, domainFilter]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (memoryId: string) => {
    if (!selectedAgentId) return;
    setDeletingId(memoryId);
    try {
      const memory = semanticMemories.find((m) => m.id === memoryId);
      if (memory) {
        // Move to staging with rejected status
        await setDoc(doc(db, `agents/${selectedAgentId}/stagingMemory`, memoryId), {
          ...memory,
          metadata: {
            ...memory.metadata,
            validationStatus: 'rejected',
          },
          proposedBy: 'user',
          explanation: 'Manually rejected from memory explorer',
          autoApprovalEligible: false,
        });
        // Delete from semantic
        await deleteDoc(doc(db, `agents/${selectedAgentId}/semanticMemory`, memoryId));
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!selectedAgentId) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p className="text-sm">Select an agent to explore memories</p>
      </div>
    );
  }

  const loading = activeTab === 'semantic' ? semanticLoading : activeTab === 'episodic' ? episodicLoading : workingLoading;
  const error = activeTab === 'semantic' ? semanticError : activeTab === 'episodic' ? episodicError : workingError;

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSearch('');
                setTagFilter(null);
                setDomainFilter(null);
              }}
              className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
                {tab.sublabel}
              </span>
              <HelpTooltip text={tab.help} />
            </button>
          );
        })}
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder={`Search ${activeTab} memories...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-600"
          />
        </div>
        {activeTab === 'semantic' && allTags.length > 0 && (
          <select
            value={tagFilter ?? ''}
            onChange={(e) => setTagFilter(e.target.value || null)}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-400 outline-none focus:border-zinc-600"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {activeTab === 'episodic' && allDomains.length > 0 && (
          <select
            value={domainFilter ?? ''}
            onChange={(e) => setDomainFilter(e.target.value || null)}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-400 outline-none focus:border-zinc-600"
          >
            <option value="">All domains</option>
            {allDomains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-red-400">
            <AlertCircle className="h-6 w-6" />
            <p className="text-sm">Failed to load memories</p>
          </div>
        )}

        {!loading && !error && activeTab === 'semantic' && (
          <>
            {filteredSemantic.length === 0 ? (
              <EmptyState message="No semantic memories found" />
            ) : (
              <div className="space-y-2">
                {filteredSemantic.map((memory) => {
                  const expanded = expandedIds.has(memory.id);
                  return (
                    <div
                      key={memory.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700"
                    >
                      <button
                        onClick={() => toggleExpanded(memory.id)}
                        className="flex w-full items-start gap-3 p-3 text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-zinc-300">
                            {expanded ? memory.content : memory.content.slice(0, 120) + (memory.content.length > 120 ? '...' : '')}
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <span className="text-xs text-zinc-500 capitalize">
                              {memory.metadata.source.replace('_', ' ')}
                            </span>
                            <span className="text-xs text-zinc-600">|</span>
                            <span className="text-xs text-zinc-500">
                              {Math.round(memory.metadata.confidence * 100)}% confidence
                            </span>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-zinc-800 px-10 py-3">
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {memory.metadata.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                              >
                                <Tag className="h-3 w-3" />
                                {tag}
                              </span>
                            ))}
                          </div>

                          <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
                            <div className="flex items-center gap-1.5 text-zinc-500">
                              <Eye className="h-3 w-3" />
                              Last accessed:{' '}
                              {memory.metadata.lastAccessed?.toDate?.()
                                ? memory.metadata.lastAccessed.toDate().toLocaleDateString()
                                : 'Never'}
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-500">
                              <Hash className="h-3 w-3" />
                              Access count: {memory.metadata.accessCount}
                            </div>
                            <div className="flex items-center gap-1.5 text-zinc-500">
                              <Shield className="h-3 w-3" />
                              {memory.accessControl.visibility}
                            </div>
                          </div>

                          {/* Confidence bar */}
                          <div className="mb-3 flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Confidence</span>
                            <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all"
                                style={{ width: `${memory.metadata.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-zinc-400">
                              {Math.round(memory.metadata.confidence * 100)}%
                            </span>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(memory.id);
                              }}
                              disabled={deletingId === memory.id}
                              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                            >
                              {deletingId === memory.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!loading && !error && activeTab === 'episodic' && (
          <>
            {filteredEpisodic.length === 0 ? (
              <EmptyState message="No episodic memories found" />
            ) : (
              <div className="space-y-2">
                {filteredEpisodic.map((episode) => {
                  const expanded = expandedIds.has(episode.episodeId);
                  return (
                    <div
                      key={episode.episodeId}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700"
                    >
                      <button
                        onClick={() => toggleExpanded(episode.episodeId)}
                        className="flex w-full items-start gap-3 p-3 text-left"
                      >
                        {expanded ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                              {episode.taskDomain}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs capitalize ${
                                OUTCOME_COLORS[episode.outcome] || 'text-zinc-400 bg-zinc-800'
                              }`}
                            >
                              {episode.outcome}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed text-zinc-300">
                            {episode.sessionSnapshot.summary}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-500">
                            <span>{Math.round(episode.duration / 1000)}s duration</span>
                            <span>{episode.sessionSnapshot.messageCount} messages</span>
                            <span>
                              {episode.createdAt?.toDate?.()
                                ? episode.createdAt.toDate().toLocaleDateString()
                                : ''}
                            </span>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-zinc-800 px-10 py-3">
                          {episode.lessonsLearned.length > 0 && (
                            <div className="mb-3">
                              <h5 className="mb-1.5 text-xs font-medium text-zinc-400">
                                Lessons Learned
                              </h5>
                              <ul className="space-y-1">
                                {episode.lessonsLearned.map((lesson, i) => (
                                  <li
                                    key={i}
                                    className="text-xs leading-relaxed text-zinc-400 before:mr-1.5 before:text-zinc-600 before:content-['-']"
                                  >
                                    {lesson}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {episode.sessionSnapshot.toolsUsed.length > 0 && (
                            <div className="mb-3">
                              <h5 className="mb-1.5 text-xs font-medium text-zinc-400">
                                Tools Used
                              </h5>
                              <div className="flex flex-wrap gap-1.5">
                                {episode.sessionSnapshot.toolsUsed.map((tool) => (
                                  <span
                                    key={tool}
                                    className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                                  >
                                    {tool}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span>
                              Consolidation: {Math.round(episode.consolidationScore * 100)}%
                            </span>
                            {episode.promotedToSemantic && (
                              <span className="rounded bg-orange-400/10 px-1.5 py-0.5 text-orange-400">
                                Promoted to Semantic
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!loading && !error && activeTab === 'working' && (
          <>
            {workingMemories.length === 0 ? (
              <EmptyState message="No active working memory sessions" />
            ) : (
              <div className="space-y-4">
                {workingMemories.map((wm) => (
                  <div
                    key={wm.sessionId || wm.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-blue-400" />
                      <h4 className="text-sm font-medium text-zinc-300">
                        Session {(wm.sessionId || wm.id).slice(0, 8)}
                      </h4>
                      <span
                        className={`ml-auto rounded px-1.5 py-0.5 text-xs ${
                          wm.syncStatus === 'synced'
                            ? 'bg-green-400/10 text-green-400'
                            : wm.syncStatus === 'conflict'
                              ? 'bg-red-400/10 text-red-400'
                              : 'bg-yellow-400/10 text-yellow-400'
                        }`}
                      >
                        {wm.syncStatus}
                      </span>
                    </div>

                    {/* Context Window */}
                    <div className="mb-3">
                      <h5 className="mb-1.5 text-xs font-medium text-zinc-500">
                        Context Window ({wm.contextWindow.length} messages)
                      </h5>
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-2">
                        {wm.contextWindow.length === 0 ? (
                          <p className="text-xs text-zinc-600">Empty context</p>
                        ) : (
                          wm.contextWindow.slice(-5).map((msg, i) => (
                            <div key={i} className="text-xs">
                              <span
                                className={`font-medium ${
                                  msg.role === 'user'
                                    ? 'text-blue-400'
                                    : msg.role === 'assistant'
                                      ? 'text-green-400'
                                      : msg.role === 'tool'
                                        ? 'text-yellow-400'
                                        : 'text-zinc-500'
                                }`}
                              >
                                {msg.role}:
                              </span>{' '}
                              <span className="text-zinc-400">
                                {msg.content.slice(0, 100)}
                                {msg.content.length > 100 ? '...' : ''}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Active Tools */}
                    <div className="mb-3">
                      <h5 className="mb-1.5 text-xs font-medium text-zinc-500">Active Tools</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {wm.activeTools.length === 0 ? (
                          <span className="text-xs text-zinc-600">None</span>
                        ) : (
                          wm.activeTools.map((tool) => (
                            <span
                              key={tool}
                              className="rounded-full bg-blue-400/10 px-2 py-0.5 text-xs text-blue-400"
                            >
                              {tool}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Temp Variables */}
                    <div>
                      <h5 className="mb-1.5 text-xs font-medium text-zinc-500">
                        Temporary Variables
                      </h5>
                      {Object.keys(wm.tempVariables).length === 0 ? (
                        <span className="text-xs text-zinc-600">None</span>
                      ) : (
                        <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
                          {Object.entries(wm.tempVariables).map(([key, value]) => (
                            <div key={key} className="flex items-baseline gap-2 text-xs">
                              <span className="font-mono text-orange-400">{key}</span>
                              <span className="text-zinc-600">=</span>
                              <span className="text-zinc-400">
                                {typeof value === 'object'
                                  ? JSON.stringify(value).slice(0, 80)
                                  : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500">
      <Inbox className="h-8 w-8" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
