'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { SemanticMemory } from '@/types';
import {
  X,
  Trash2,
  Save,
  Tag,
  Eye,
  EyeOff,
  Hash,
  Shield,
  ShieldCheck,
  Clock,
  BarChart3,
  AlertCircle,
  Loader2,
  Plus,
} from 'lucide-react';

interface MemoryDetailProps {
  memory: SemanticMemory;
  onClose?: () => void;
  onDeleted?: () => void;
}

export default function MemoryDetail({ memory, onClose, onDeleted }: MemoryDetailProps) {
  const [editedContent, setEditedContent] = useState(memory.content);
  const [editedTags, setEditedTags] = useState<string[]>([...memory.metadata.tags]);
  const [newTag, setNewTag] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasChanges =
    editedContent !== memory.content ||
    JSON.stringify(editedTags) !== JSON.stringify(memory.metadata.tags);

  const handleSave = async () => {
    // In-place edit of approved memories breaks the audit chain (the original
    // hash no longer matches new content). Editing is disabled until we ship
    // a "supersede" flow that preserves the lineage.
    setSaveError(
      'Editing approved memories is disabled to preserve the audit chain. Purge and re-add instead.',
    );
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const purgeFn = httpsCallable<
        { agentId: string; memoryId: string; reason?: string },
        { ok: boolean }
      >(functions, 'purgeMemory');
      await purgeFn({
        agentId: memory.agentId,
        memoryId: memory.id,
        reason: 'Purged from memory detail panel',
      });
      onDeleted?.();
      onClose?.();
    } catch (err) {
      console.error('Failed to delete memory:', err);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const addTag = () => {
    const trimmed = newTag.trim().toLowerCase();
    if (trimmed && !editedTags.includes(trimmed)) {
      setEditedTags([...editedTags, trimmed]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setEditedTags(editedTags.filter((t) => t !== tag));
  };

  const confidencePercent = Math.round(memory.metadata.confidence * 100);

  const sourceColors: Record<string, string> = {
    conversation: 'bg-blue-500/20 text-blue-400',
    document: 'bg-green-500/20 text-green-400',
    episodic_promotion: 'bg-orange-500/20 text-orange-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-6 py-4">
          <h3 className="text-lg font-semibold text-zinc-100">Memory Detail</h3>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                title="Editing approved memories breaks the audit chain. Purge and re-add instead."
                className="rounded-md px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                Edit
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="text-zinc-400 transition-colors hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Source badge */}
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                sourceColors[memory.metadata.source] || 'bg-zinc-700 text-zinc-300'
              }`}
            >
              {memory.metadata.source.replace('_', ' ')}
            </span>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
              {memory.metadata.validationStatus}
            </span>
          </div>

          {/* Content */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-400">Content</label>
            {isEditing ? (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={5}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <p className="rounded-lg bg-zinc-800/50 p-3 text-sm leading-relaxed text-zinc-300">
                {memory.content}
              </p>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-400">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(isEditing ? editedTags : memory.metadata.tags).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400"
                >
                  {tag}
                  {isEditing && (
                    <button
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {isEditing && (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Add tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    className="w-20 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500"
                  />
                  <button
                    onClick={addTag}
                    disabled={!newTag.trim()}
                    className="rounded-full bg-zinc-800 p-1 text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Confidence */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <BarChart3 className="h-3.5 w-3.5" />
                Confidence
              </div>
              <div className="mt-2">
                <div className="h-2 w-full rounded-full bg-zinc-700">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${confidencePercent}%`,
                      backgroundColor:
                        confidencePercent >= 80
                          ? '#22c55e'
                          : confidencePercent >= 50
                            ? '#eab308'
                            : '#ef4444',
                    }}
                  />
                </div>
                <span
                  className={`mt-1 block text-sm font-medium ${
                    confidencePercent >= 80
                      ? 'text-green-400'
                      : confidencePercent >= 50
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }`}
                >
                  {confidencePercent}%
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Hash className="h-3.5 w-3.5" />
                Access Count
              </div>
              <span className="mt-1 block text-lg font-semibold text-zinc-100">
                {memory.metadata.accessCount}
              </span>
            </div>
          </div>

          {/* Access Control — strict tenant isolation by design */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Shield className="h-3.5 w-3.5" />
              Access Control
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm text-zinc-300">
              <EyeOff className="h-3.5 w-3.5" /> Tenant-private
            </div>
          </div>

          {/* Access History */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Created:{' '}
              {memory.metadata.createdAt?.toDate?.()
                ? memory.metadata.createdAt.toDate().toLocaleString()
                : 'Unknown'}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Last accessed:{' '}
              {memory.metadata.lastAccessed?.toDate?.()
                ? memory.metadata.lastAccessed.toDate().toLocaleString()
                : 'Never'}
            </span>
          </div>

          {/* Save error */}
          {saveError && (
            <div className="flex items-center gap-2 rounded-md bg-red-400/10 p-2.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {saveError}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-zinc-700 px-6 py-4">
          {isEditing ? (
            <div className="flex w-full items-center gap-2">
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditedContent(memory.content);
                  setEditedTags([...memory.metadata.tags]);
                  setSaveError(null);
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : showDeleteConfirm ? (
            <div className="flex w-full items-center gap-2">
              <span className="text-sm text-red-400">Delete permanently?</span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Yes, delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <Link
                href={`/audit/${memory.agentId}/${memory.id}`}
                className="flex items-center gap-1.5 text-sm text-zinc-300 transition-colors hover:text-zinc-100"
              >
                <ShieldCheck className="h-4 w-4" />
                View audit trail
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 text-sm text-red-400 transition-colors hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
