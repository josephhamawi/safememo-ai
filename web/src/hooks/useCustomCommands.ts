'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { SlashCommand } from '@/lib/slashCommands';

interface FirestoreCommand {
  name: string;
  prompt: string;
  label?: string;
  description?: string;
  createdAt?: unknown;
}

/**
 * Manages user-defined custom slash commands stored in Firestore at
 * users/{uid}/commands/{slug}.
 */
export function useCustomCommands() {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const ref = collection(db, 'users', user.uid, 'commands');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const items: SlashCommand[] = snap.docs.map((d) => {
          const data = d.data() as FirestoreCommand;
          return {
            name: d.id,
            label: data.label || data.name,
            description: data.description || data.prompt.slice(0, 80),
            prompt: data.prompt,
            category: 'custom',
            builtin: false,
          };
        });
        setCommands(items);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load custom commands:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const saveCommand = useCallback(
    async (name: string, prompt: string, label?: string, description?: string) => {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');
      const ref = doc(db, 'users', user.uid, 'commands', name);
      await setDoc(ref, {
        name,
        prompt,
        label: label || name,
        description: description || prompt.slice(0, 80),
        createdAt: serverTimestamp(),
      });
    },
    []
  );

  const deleteCommand = useCallback(async (name: string) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    await deleteDoc(doc(db, 'users', user.uid, 'commands', name));
  }, []);

  return { commands, loading, saveCommand, deleteCommand };
}
