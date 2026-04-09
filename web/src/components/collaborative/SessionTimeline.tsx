'use client';

import { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  MessageSquare,
  Wrench,
  Brain,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: 'message' | 'tool_call' | 'memory_staged' | 'memory_approved' | 'memory_rejected';
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface SessionTimelineProps {
  agentId: string;
  conversationId: string;
}

const EVENT_CONFIG: Record<
  string,
  { icon: typeof MessageSquare; color: string; dotColor: string }
> = {
  message: { icon: MessageSquare, color: 'text-blue-400', dotColor: 'bg-blue-400' },
  tool_call: { icon: Wrench, color: 'text-amber-400', dotColor: 'bg-amber-400' },
  memory_staged: { icon: Brain, color: 'text-orange-400', dotColor: 'bg-orange-400' },
  memory_approved: { icon: CheckCircle, color: 'text-green-400', dotColor: 'bg-green-400' },
  memory_rejected: { icon: XCircle, color: 'text-red-400', dotColor: 'bg-red-400' },
};

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export default function SessionTimeline({ agentId, conversationId }: SessionTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Listen to messages for message + tool_call events
  useEffect(() => {
    if (!agentId || !conversationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const messagesRef = collection(
      db,
      'agents',
      agentId,
      'conversations',
      conversationId,
      'messages'
    );
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messageEvents: TimelineEvent[] = [];

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const timestamp = data.timestamp?.toDate?.() || new Date();

          // Message event
          const roleLabel = data.role === 'user' ? 'You' : data.role === 'system' ? 'System' : 'Agent';
          const preview = data.content
            ? data.content.substring(0, 60) + (data.content.length > 60 ? '...' : '')
            : '(empty)';

          messageEvents.push({
            id: docSnap.id,
            type: 'message',
            description: `${roleLabel}: ${preview}`,
            timestamp,
            metadata: { role: data.role },
          });

          // Tool call events from within messages
          if (data.toolCalls && Array.isArray(data.toolCalls)) {
            for (const tc of data.toolCalls) {
              messageEvents.push({
                id: `${docSnap.id}-tool-${tc.toolId}`,
                type: 'tool_call',
                description: `${tc.toolName} (${tc.status})`,
                timestamp: tc.timestamp?.toDate?.() || timestamp,
                metadata: { duration: tc.duration, status: tc.status },
              });
            }
          }
        });

        setEvents((prev) => {
          // Merge: keep memory events, replace message/tool events
          const memoryEvents = prev.filter(
            (e) => e.type === 'memory_staged' || e.type === 'memory_approved' || e.type === 'memory_rejected'
          );
          const merged = [...messageEvents, ...memoryEvents];
          merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          return merged;
        });
        setLoading(false);
      },
      (err) => {
        console.error('Timeline messages error:', err);
        setError('Failed to load timeline events');
        setLoading(false);
      }
    );

    // Listen to staging memory changes for memory_staged / memory_approved / memory_rejected
    const stagingRef = collection(db, 'agents', agentId, 'memory', 'staging');
    const unsubStaging = onSnapshot(stagingRef, (snapshot) => {
      const memEvents: TimelineEvent[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data.metadata?.createdAt?.toDate?.() || new Date();
        const status = data.metadata?.validationStatus;

        let type: TimelineEvent['type'] = 'memory_staged';
        if (status === 'approved') type = 'memory_approved';
        if (status === 'rejected') type = 'memory_rejected';

        const preview = data.content
          ? data.content.substring(0, 50) + (data.content.length > 50 ? '...' : '')
          : 'Memory';

        memEvents.push({
          id: `mem-${docSnap.id}`,
          type,
          description:
            type === 'memory_staged'
              ? `Memory proposed: ${preview}`
              : type === 'memory_approved'
                ? `Memory approved: ${preview}`
                : `Memory rejected: ${preview}`,
          timestamp: createdAt,
        });
      });

      setEvents((prev) => {
        // Merge: keep message/tool events, replace memory events
        const nonMemEvents = prev.filter(
          (e) => e.type !== 'memory_staged' && e.type !== 'memory_approved' && e.type !== 'memory_rejected'
        );
        const merged = [...nonMemEvents, ...memEvents];
        merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return merged;
      });
    });

    return () => {
      unsubMessages();
      unsubStaging();
    };
  }, [agentId, conversationId]);

  // Auto-scroll to top on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-red-400">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500">
        <Clock className="h-8 w-8" />
        <p className="text-sm">No events yet</p>
        <p className="text-xs">Events will appear as the conversation progresses</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3">
      <div className="relative">
        {/* Vertical connecting line */}
        <div className="absolute bottom-0 left-3 top-0 w-px bg-zinc-700" />

        <div className="space-y-4">
          {events.map((event, index) => {
            const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.message;
            const Icon = config.icon;

            return (
              <div key={event.id} className="relative flex gap-3 pl-0">
                {/* Dot on the timeline */}
                <div className="relative z-10 flex-shrink-0">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 ring-2 ring-zinc-800">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>
                </div>

                {/* Event content */}
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-sm leading-snug text-zinc-300">{event.description}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <time className="text-xs text-zinc-500">
                      {event.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                    <span className="text-xs text-zinc-600">
                      {formatRelativeTime(event.timestamp)}
                    </span>
                    {event.metadata?.duration != null && (
                      <span className="text-xs text-zinc-600">
                        {Math.round(event.metadata.duration as number)}ms
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
