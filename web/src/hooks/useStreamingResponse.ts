'use client';

import { useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppStore } from '@/store';
import type { StreamToken } from '@/types';

export function useStreamingResponse(agentId: string | null, conversationId: string | null) {
  const { setStreamingContent, setIsStreaming } = useAppStore();
  const tokensRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (!agentId || !conversationId) return;

    const streamRef = collection(
      db,
      'agents',
      agentId,
      'conversations',
      conversationId,
      'stream'
    );
    const q = query(streamRef, orderBy('index', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const token = change.doc.data() as StreamToken;
          tokensRef.current.set(token.index, token.token);

          if (token.done) {
            setIsStreaming(false);
            // Clean up stream tokens
            snapshot.docs.forEach((d) => {
              deleteDoc(doc(streamRef, d.id)).catch(() => {});
            });
            tokensRef.current.clear();
          } else {
            setIsStreaming(true);
            // Reconstruct full content from ordered tokens
            const sorted = Array.from(tokensRef.current.entries())
              .sort(([a], [b]) => a - b)
              .map(([, text]) => text);
            setStreamingContent(sorted.join(''));
          }
        }
      });
    });

    return () => {
      unsubscribe();
      tokensRef.current.clear();
    };
  }, [agentId, conversationId, setStreamingContent, setIsStreaming]);

  const clearStream = useCallback(() => {
    tokensRef.current.clear();
    setStreamingContent('');
    setIsStreaming(false);
  }, [setStreamingContent, setIsStreaming]);

  return { clearStream };
}
