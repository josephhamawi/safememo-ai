'use client';

import { useState, useMemo } from 'react';
import {
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection';
import type { StagingMemory, SemanticMemory } from '@/types';
import {
  Check,
  X,
  AlertTriangle,
  Copy,
  Loader2,
  Inbox,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
} from 'lucide-react';

interface ValidationQueueProps {
  agentId: string;
}

export default function ValidationQueue({ agentId }: ValidationQueueProps) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: stagingMemories, loading, error } = useFirestoreCollection<StagingMemory>(
    agentId ? `agents/${agentId}/stagingMemory` : '',
    {
      enabled: !!agentId,
    }
  );

  const pendingCount = useMemo(
    () => stagingMemories.filter((m) => m.metadata.validationStatus === 'staging').length,
    [stagingMemories]
  );

  const handleApprove = async (memory: StagingMemory & { id: string }) => {
    setProcessingId(memory.id);
    try {
      // Write to semantic collection
      const semanticData: Omit<SemanticMemory, 'id'> = {
        agentId: memory.agentId,
        content: memory.content,
        embedding: memory.embedding,
        metadata: {
          ...memory.metadata,
          validationStatus: 'approved',
          lastAccessed: Timestamp.now(),
        },
        accessControl: memory.accessControl,
      };
      await setDoc(doc(db, `agents/${agentId}/semanticMemory`, memory.id), semanticData);
      // Remove from staging
      await deleteDoc(doc(db, `agents/${agentId}/stagingMemory`, memory.id));
    } catch (err) {
      console.error('Failed to approve memory:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (memoryId: string) => {
    if (!rejectReason.trim()) return;
    setProcessingId(memoryId);
    try {
      await updateDoc(doc(db, `agents/${agentId}/stagingMemory`, memoryId), {
        'metadata.validationStatus': 'rejected',
        rejectionReason: rejectReason.trim(),
      });
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      console.error('Failed to reject memory:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-950 text-red-400">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">Failed to load validation queue</p>
      </div>
    );
  }

  const pendingMemories = stagingMemories.filter(
    (m) => m.metadata.validationStatus === 'staging'
  );

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-200">Validation Queue</h3>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white">
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {pendingMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">No memories pending validation</p>
            <p className="text-xs">New memory proposals will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingMemories.map((memory) => (
              <div
                key={memory.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900"
              >
                {/* Memory content */}
                <div className="p-4">
                  <p className="mb-2 text-sm leading-relaxed text-zinc-300">
                    {memory.content}
                  </p>

                  {/* Explanation */}
                  <div className="mb-3 flex items-start gap-2 rounded-md bg-zinc-800/50 p-2.5">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <div>
                      <p className="text-xs font-medium text-zinc-400">
                        Proposed by {memory.proposedBy}
                      </p>
                      <p className="text-xs text-zinc-500">{memory.explanation}</p>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {memory.metadata.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Checks */}
                  <div className="space-y-2">
                    {/* Duplicate check */}
                    {memory.duplicateCheckResult && (
                      <div
                        className={`flex items-start gap-2 rounded-md p-2 text-xs ${
                          memory.duplicateCheckResult.hasDuplicate
                            ? 'bg-yellow-400/5 text-yellow-400'
                            : 'bg-green-400/5 text-green-400'
                        }`}
                      >
                        {memory.duplicateCheckResult.hasDuplicate ? (
                          <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <div>
                          <p className="font-medium">
                            {memory.duplicateCheckResult.hasDuplicate
                              ? 'Potential duplicate found'
                              : 'No duplicates detected'}
                          </p>
                          {memory.duplicateCheckResult.hasDuplicate &&
                            memory.duplicateCheckResult.similarityScore !== undefined && (
                              <p className="mt-0.5 text-zinc-500">
                                Similarity:{' '}
                                {Math.round(memory.duplicateCheckResult.similarityScore * 100)}%
                                {memory.duplicateCheckResult.similarMemoryId && (
                                  <span>
                                    {' '}
                                    (ID: {memory.duplicateCheckResult.similarMemoryId.slice(0, 8)}
                                    ...)
                                  </span>
                                )}
                              </p>
                            )}
                        </div>
                      </div>
                    )}

                    {/* Contradiction check */}
                    {memory.contradictionCheckResult && (
                      <div
                        className={`flex items-start gap-2 rounded-md p-2 text-xs ${
                          memory.contradictionCheckResult.hasContradiction
                            ? 'bg-red-400/5 text-red-400'
                            : 'bg-green-400/5 text-green-400'
                        }`}
                      >
                        {memory.contradictionCheckResult.hasContradiction ? (
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <div>
                          <p className="font-medium">
                            {memory.contradictionCheckResult.hasContradiction
                              ? 'Contradiction detected'
                              : 'No contradictions found'}
                          </p>
                          {memory.contradictionCheckResult.hasContradiction &&
                            memory.contradictionCheckResult.explanation && (
                              <p className="mt-0.5 text-zinc-500">
                                {memory.contradictionCheckResult.explanation}
                              </p>
                            )}
                        </div>
                      </div>
                    )}

                    {/* Auto-approval */}
                    <div
                      className={`flex items-center gap-2 rounded-md p-2 text-xs ${
                        memory.autoApprovalEligible
                          ? 'bg-blue-400/5 text-blue-400'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {memory.autoApprovalEligible
                          ? `Auto-approval eligible: ${memory.autoApprovalReason || 'meets threshold'}`
                          : 'Manual review required'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center border-t border-zinc-800">
                  {rejectingId === memory.id ? (
                    <div className="flex w-full items-center gap-2 p-3">
                      <input
                        type="text"
                        placeholder="Rejection reason..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-500"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleReject(memory.id);
                          if (e.key === 'Escape') {
                            setRejectingId(null);
                            setRejectReason('');
                          }
                        }}
                      />
                      <button
                        onClick={() => handleReject(memory.id)}
                        disabled={!rejectReason.trim() || processingId === memory.id}
                        className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:opacity-50"
                      >
                        {processingId === memory.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleApprove(memory)}
                        disabled={processingId === memory.id}
                        className="flex flex-1 items-center justify-center gap-1.5 border-r border-zinc-800 py-2.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-400/5 disabled:opacity-50"
                      >
                        {processingId === memory.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectingId(memory.id)}
                        disabled={processingId === memory.id}
                        className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-400/5 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
