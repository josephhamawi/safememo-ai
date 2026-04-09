'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkingMemory, Message } from '@/types';

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('noomachy_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('noomachy_device_id', id);
  }
  return id;
}

export function useWorkingMemory(agentId: string | null, sessionId?: string) {
  const [memory, setMemory] = useState<WorkingMemory | null>(null);
  const [loading, setLoading] = useState(true);

  const deviceId = typeof window !== 'undefined' ? getDeviceId() : 'server';
  const activeSession = sessionId || deviceId;

  useEffect(() => {
    if (!agentId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'agents', agentId, 'memory', 'working', activeSession);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setMemory(snapshot.data() as WorkingMemory);
        } else {
          setMemory(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Working memory sync error:', error);
        // Fallback to IndexedDB
        loadFromIndexedDB(agentId, activeSession).then((cached) => {
          if (cached) setMemory(cached);
          setLoading(false);
        });
      }
    );

    return unsubscribe;
  }, [agentId, activeSession]);

  const updateMemory = useCallback(
    async (updates: Partial<WorkingMemory>) => {
      if (!agentId) return;
      const ref = doc(db, 'agents', agentId, 'memory', 'working', activeSession);
      await updateDoc(ref, {
        ...updates,
        syncStatus: 'synced',
        updatedAt: serverTimestamp(),
      });
    },
    [agentId, activeSession]
  );

  const initSession = useCallback(
    async (userId: string) => {
      if (!agentId) return;
      const ref = doc(db, 'agents', agentId, 'memory', 'working', activeSession);
      const ttl = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
      const newMemory: WorkingMemory = {
        sessionId: activeSession,
        agentId,
        userId,
        contextWindow: [],
        activeTools: [],
        tempVariables: {},
        ttl,
        deviceId,
        syncStatus: 'synced',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await setDoc(ref, newMemory);
      return newMemory;
    },
    [agentId, activeSession, deviceId]
  );

  return { memory, loading, updateMemory, initSession };
}

// IndexedDB fallback
async function loadFromIndexedDB(
  agentId: string,
  sessionId: string
): Promise<WorkingMemory | null> {
  try {
    const dbRequest = indexedDB.open('noomachy_cache', 1);
    return new Promise((resolve) => {
      dbRequest.onupgradeneeded = () => {
        const idb = dbRequest.result;
        if (!idb.objectStoreNames.contains('working_memory')) {
          idb.createObjectStore('working_memory');
        }
      };
      dbRequest.onsuccess = () => {
        const idb = dbRequest.result;
        const tx = idb.transaction('working_memory', 'readonly');
        const store = tx.objectStore('working_memory');
        const req = store.get(`${agentId}:${sessionId}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      };
      dbRequest.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
