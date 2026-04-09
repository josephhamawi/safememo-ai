'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

interface PresenceUser {
  uid: string;
  displayName: string;
  photoURL: string | null;
  lastSeen: Timestamp;
}

interface PresenceIndicatorProps {
  agentId: string;
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
  'bg-red-500',
];

function colorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function PresenceIndicator({ agentId }: PresenceIndicatorProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Write own presence on mount, heartbeat every 30s, remove on unmount
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !agentId) return;

    const presenceRef = doc(db, 'agents', agentId, 'presence', user.uid);

    const writePresence = () => {
      setDoc(presenceRef, {
        uid: user.uid,
        displayName: user.displayName || user.email || 'Anonymous',
        photoURL: user.photoURL,
        lastSeen: serverTimestamp(),
      }).catch((err) => console.error('Presence write failed:', err));
    };

    writePresence();
    const interval = setInterval(writePresence, 30000);

    return () => {
      clearInterval(interval);
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [agentId]);

  // Listen for all present users
  useEffect(() => {
    if (!agentId) {
      setLoading(false);
      return;
    }

    const presenceRef = collection(db, 'agents', agentId, 'presence');
    const unsubscribe = onSnapshot(
      presenceRef,
      (snapshot) => {
        const now = Date.now();
        const STALE_THRESHOLD_MS = 60000; // 1 minute

        const activeUsers = snapshot.docs
          .map((d) => d.data() as PresenceUser)
          .filter((u) => {
            const lastSeen = u.lastSeen?.toDate?.()?.getTime() || 0;
            return now - lastSeen < STALE_THRESHOLD_MS;
          })
          .sort((a, b) => {
            // Current user first, then alphabetical
            const currentUid = auth.currentUser?.uid;
            if (a.uid === currentUid) return -1;
            if (b.uid === currentUid) return 1;
            return a.displayName.localeCompare(b.displayName);
          });

        setUsers(activeUsers);
        setLoading(false);
      },
      (err) => {
        console.error('Presence listener error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [agentId]);

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />;
  }

  if (users.length === 0) return null;

  const MAX_VISIBLE = 4;
  const visible = users.slice(0, MAX_VISIBLE);
  const overflow = users.length - MAX_VISIBLE;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <div key={user.uid} className="group relative">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="h-7 w-7 rounded-full border-2 border-zinc-900 object-cover"
              />
            ) : (
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-900 text-xs font-bold text-white ${colorForUid(user.uid)}`}
              >
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Online indicator dot */}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 bg-green-500" />
            {/* Tooltip */}
            <div className="pointer-events-none absolute -bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {user.displayName}
              {user.uid === auth.currentUser?.uid ? ' (you)' : ''}
            </div>
          </div>
        ))}
        {overflow > 0 && (
          <div className="group relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-700 text-xs font-medium text-zinc-300">
            +{overflow}
            <div className="pointer-events-none absolute -bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {overflow} more {overflow === 1 ? 'user' : 'users'}
            </div>
          </div>
        )}
      </div>
      <span className="ml-2 text-xs text-zinc-500">
        {users.length} online
      </span>
    </div>
  );
}
