'use client';

import { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAppStore } from '@/store';
import {
  Bell,
  Brain,
  AlertTriangle,
  Wrench,
  Info,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { Notification } from '@/types';

const TYPE_ICONS: Record<string, typeof Brain> = {
  memory_validation: Brain,
  agent_error: AlertTriangle,
  skill_update: Wrench,
  system: Info,
};

const TYPE_COLORS: Record<string, string> = {
  memory_validation: 'text-orange-400',
  agent_error: 'text-red-400',
  skill_update: 'text-amber-400',
  system: 'text-blue-400',
};

function formatNotificationTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<(Notification & { id: string })[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);

  // Real-time listener on notifications
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const ref = collection(db, 'notifications', user.uid, 'items');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(30));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as (Notification & { id: string })[];

        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.read).length);
        setLoading(false);
      },
      (err) => {
        console.error('Notification listener error:', err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAsRead = async (notificationId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const ref = doc(db, 'notifications', user.uid, 'items', notificationId);
      await updateDoc(ref, { read: true });
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleNotificationClick = (notification: Notification & { id: string }) => {
    markAsRead(notification.id);

    // Navigate to validation queue for memory_validation notifications
    if (notification.type === 'memory_validation') {
      setRightPanelTab('memory');
      setRightPanelOpen(true);
    }
  };

  const markAllAsRead = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, 'notifications', user.uid, 'items', n.id), { read: true }).catch(
          () => {}
        )
      )
    );
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
            <h4 className="text-sm font-semibold text-zinc-200">Notifications</h4>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-400 transition-colors hover:text-blue-300"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 transition-colors hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="mx-auto h-6 w-6 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-500">No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] || Info;
                const color = TYPE_COLORS[notification.type] || 'text-zinc-400';

                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800 ${
                      !notification.read ? 'bg-zinc-800/50' : ''
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm ${
                            notification.read ? 'text-zinc-400' : 'font-medium text-zinc-200'
                          }`}
                        >
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                        {notification.body}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <time className="text-xs text-zinc-600">
                          {notification.createdAt?.toDate?.()
                            ? formatNotificationTime(notification.createdAt.toDate())
                            : ''}
                        </time>
                        {notification.type === 'memory_validation' && (
                          <span className="flex items-center gap-0.5 text-xs text-orange-400">
                            <ExternalLink className="h-3 w-3" />
                            View queue
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
