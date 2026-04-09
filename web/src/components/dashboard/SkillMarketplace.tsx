'use client';

import { useState, useMemo } from 'react';
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection';
import { useAppStore } from '@/store';
import type { Skill } from '@/types';
import {
  Search,
  Download,
  Trash2,
  Star,
  Shield,
  HardDrive,
  Globe,
  Terminal,
  Database,
  Loader2,
  AlertCircle,
  Package,
  Users,
  Check,
  Plus,
  Link,
  X,
} from 'lucide-react';
import HelpTooltip from '@/components/ui/HelpTooltip';

const PERMISSION_CONFIG: Record<
  string,
  { icon: typeof Shield; label: string; color: string }
> = {
  filesystem: {
    icon: HardDrive,
    label: 'Filesystem',
    color: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
  },
  network: {
    icon: Globe,
    label: 'Network',
    color: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
  },
  exec: {
    icon: Terminal,
    label: 'Exec',
    color: 'bg-red-400/10 text-red-400 border-red-400/20',
  },
  db: {
    icon: Database,
    label: 'Database',
    color: 'bg-green-400/10 text-green-400 border-green-400/20',
  },
};

function TrustScoreBadge({ score }: { score: number }) {
  const percent = Math.round(score * 100);
  let colorClass = 'text-red-400';
  if (percent >= 80) colorClass = 'text-green-400';
  else if (percent >= 50) colorClass = 'text-yellow-400';

  return (
    <div className="flex items-center gap-1">
      <Star className={`h-3.5 w-3.5 ${colorClass}`} />
      <span className={`text-xs font-medium ${colorClass}`}>{percent}%</span>
    </div>
  );
}

export default function SkillMarketplace() {
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const agents = useAppStore((s) => s.agents);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showAddMcp, setShowAddMcp] = useState(false);

  const {
    data: skills,
    loading,
    error,
  } = useFirestoreCollection<Skill>('skills');

  // Derive categories from loaded skills
  const categories = useMemo(() => {
    const cats = new Set<string>();
    skills.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [skills]);

  // Filter skills by search and category
  const filteredSkills = useMemo(() => {
    let items = skills;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (selectedCategory) {
      items = items.filter((s) => s.category === selectedCategory);
    }
    return items;
  }, [skills, search, selectedCategory]);

  const enabledSkills = selectedAgent?.enabledSkills || [];

  const handleInstall = async (skillId: string) => {
    if (!selectedAgentId) return;
    setProcessingId(skillId);
    try {
      const agentRef = doc(db, 'agents', selectedAgentId);
      await updateDoc(agentRef, {
        enabledSkills: arrayUnion(skillId),
      });
    } catch (err) {
      console.error('Failed to install skill:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!selectedAgentId) return;
    setProcessingId(skillId);
    try {
      const agentRef = doc(db, 'agents', selectedAgentId);
      await updateDoc(agentRef, {
        enabledSkills: arrayRemove(skillId),
      });
    } catch (err) {
      console.error('Failed to uninstall skill:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-950 text-red-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Failed to load skills</p>
        <p className="text-xs text-zinc-500">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-lg font-semibold text-zinc-200">Skill Marketplace</h2>
            <HelpTooltip text="Skills extend your agent's capabilities. Install skills to give your agent access to tools like web search, code execution, and more." />
          </div>
          <p className="mt-0.5 text-sm text-zinc-500">
            Browse and install skills for your agent
          </p>
        </div>
        <button
          onClick={() => setShowAddMcp(true)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Custom MCP
        </button>
      </div>

      {/* Search bar */}
      <div className="border-b border-zinc-800 px-6 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search skills by name, description, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* Category filter tabs */}
      {categories.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-6 py-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCategory === null
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Skills grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500">
            <Package className="h-8 w-8" />
            <p className="text-sm">
              {search || selectedCategory ? 'No skills match your filters' : 'No skills available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredSkills.map((skill) => {
              const isInstalled = enabledSkills.includes(skill.id);
              const isProcessing = processingId === skill.id;

              return (
                <div
                  key={skill.id}
                  className={`flex flex-col rounded-lg border bg-zinc-900 p-4 transition-colors ${
                    isInstalled ? 'border-blue-500/30' : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Skill header */}
                  <div className="mb-2 flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-zinc-200">{skill.name}</h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        v{skill.version} by {skill.author}
                      </p>
                    </div>
                    <TrustScoreBadge score={skill.trustScore} />
                  </div>

                  {/* Description */}
                  <p className="mb-3 flex-1 text-xs leading-relaxed text-zinc-400">
                    {skill.description}
                  </p>

                  {/* Install count */}
                  <div className="mb-3 flex items-center gap-1 text-xs text-zinc-500">
                    <Users className="h-3 w-3" />
                    <span>
                      {skill.installCount.toLocaleString()} install
                      {skill.installCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Permission badges */}
                  {skill.permissions.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {skill.permissions.map((perm) => {
                        const config = PERMISSION_CONFIG[perm];
                        if (!config) return null;
                        const Icon = config.icon;
                        return (
                          <span
                            key={perm}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${config.color}`}
                          >
                            <Icon className="h-3 w-3" />
                            {config.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Tags */}
                  {skill.tags.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {skill.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500"
                        >
                          {tag}
                        </span>
                      ))}
                      {skill.tags.length > 4 && (
                        <span className="text-xs text-zinc-600">
                          +{skill.tags.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Install / Uninstall button */}
                  {selectedAgentId ? (
                    isInstalled ? (
                      <button
                        onClick={() => handleUninstall(skill.id)}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-zinc-700 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-red-500/30 hover:bg-red-400/5 hover:text-red-400 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-400" />
                            Installed
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(skill.id)}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-blue-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            Install
                          </>
                        )}
                      </button>
                    )
                  ) : (
                    <p className="rounded-md border border-zinc-800 py-1.5 text-center text-xs text-zinc-600">
                      Select an agent to install skills
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Custom MCP Dialog */}
      {showAddMcp && (
        <AddCustomMcpDialog
          agentId={selectedAgentId}
          onClose={() => setShowAddMcp(false)}
        />
      )}
    </div>
  );
}

function AddCustomMcpDialog({
  agentId,
  onClose,
}: {
  agentId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !endpoint.trim()) {
      setError('Name and endpoint URL are required');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('Not authenticated');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Save to user's custom MCPs collection
      await addDoc(collection(db, 'users', user.uid, 'customMcps'), {
        name: name.trim(),
        description: description.trim(),
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim() || null,
        agentId: agentId || null,
        enabled: true,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      console.error('Failed to add custom MCP:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Link className="h-5 w-5 text-orange-400" />
            <h3 className="text-lg font-semibold text-zinc-100">Add Custom MCP Server</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Notion MCP"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this MCP server do?"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Endpoint URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://your-mcp-server.com/mcp"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              API Key <span className="text-xs text-zinc-500">(optional)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Bearer token for authentication"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-orange-600 focus:ring-1 focus:ring-orange-600"
            />
          </div>

          <p className="text-xs text-zinc-500">
            Custom MCP servers must implement the{' '}
            <span className="font-medium text-zinc-400">Model Context Protocol</span>{' '}
            with <code className="text-orange-400">/tools/list</code> and{' '}
            <code className="text-orange-400">/tools/call</code> endpoints.
          </p>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !endpoint.trim()}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add MCP Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
