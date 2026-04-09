'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, Info, X, XCircle } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

const TOAST_CONFIG: Record<
  ToastItem['type'],
  { icon: typeof Info; bg: string; border: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle,
    bg: 'bg-green-950/90',
    border: 'border-green-800',
    iconColor: 'text-green-400',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-950/90',
    border: 'border-red-800',
    iconColor: 'text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-950/90',
    border: 'border-amber-800',
    iconColor: 'text-amber-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-950/90',
    border: 'border-blue-800',
    iconColor: 'text-blue-400',
  },
};

// Global toast state
let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let toasts: ToastItem[] = [];

function notify() {
  toastListeners.forEach((l) => l([...toasts]));
}

export function toast(item: Omit<ToastItem, 'id'>) {
  const id = crypto.randomUUID();
  toasts.push({ ...item, id });
  notify();

  const duration = item.duration ?? 4000;
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, duration);
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {items.map((item) => {
        const config = TOAST_CONFIG[item.type];
        const Icon = config.icon;

        return (
          <div
            key={item.id}
            className={`flex items-start gap-3 rounded-lg border ${config.border} ${config.bg} px-4 py-3 shadow-2xl backdrop-blur-sm animate-in slide-in-from-right-5 duration-200`}
            style={{ minWidth: 300, maxWidth: 420 }}
          >
            <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${config.iconColor}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">{item.title}</p>
              {item.message && (
                <p className="mt-0.5 text-xs text-zinc-400">{item.message}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(item.id)}
              className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
