'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  query,
  onSnapshot,
  type Query,
  type DocumentData,
  type QueryConstraint,
  orderBy,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UseCollectionOptions {
  constraints?: QueryConstraint[];
  enabled?: boolean;
}

export function useFirestoreCollection<T extends DocumentData>(
  path: string,
  options: UseCollectionOptions = {}
) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { constraints = [], enabled = true } = options;

  useEffect(() => {
    if (!enabled || !path || path.includes('/null') || path.includes('/undefined')) {
      setLoading(false);
      return;
    }

    const ref = collection(db, path);
    const q = constraints.length > 0 ? query(ref, ...constraints) : query(ref);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as (T & { id: string })[];
        setData(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Firestore error for ${path}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [path, enabled, JSON.stringify(constraints.map(String))]);

  return { data, loading, error };
}

export function useFirestoreDoc<T extends DocumentData>(
  path: string,
  enabled = true
) {
  const [data, setData] = useState<(T & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }

    const ref = doc(db, path);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setData({ id: snapshot.id, ...snapshot.data() } as T & { id: string });
        } else {
          setData(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`Firestore doc error for ${path}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [path, enabled]);

  return { data, loading, error };
}
