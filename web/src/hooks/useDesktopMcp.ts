'use client';

import { useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

interface NoomachyDesktop {
  isDesktopApp: boolean;
  getTunnelUrl: () => Promise<string | null>;
  onTunnelReady: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    noomachy?: NoomachyDesktop;
  }
}

/**
 * Auto-registers the local desktop MCP server as a Custom MCP for the user
 * when the web app is running inside the Noomachy Electron desktop wrapper.
 *
 * This makes Mail/Notes/Calendar/etc. tools available to the cloud agent
 * via a Cloudflare Quick Tunnel without any manual setup.
 */
export function useDesktopMcp() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.noomachy?.isDesktopApp) return;

    const registerMcp = async (publicUrl: string) => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // Check if a Desktop MCP is already registered for this user
        const mcpsRef = collection(db, 'users', user.uid, 'customMcps');
        const q = query(mcpsRef, where('name', '==', 'Desktop Control'));
        const snap = await getDocs(q);

        if (snap.empty) {
          // Register new
          await addDoc(mcpsRef, {
            name: 'Desktop Control',
            description: 'Local Mac apps: Mail, Notes, Calendar, Reminders, Files, System',
            endpoint: publicUrl,
            apiKey: null,
            enabled: true,
            isAutoManaged: true,
            createdAt: serverTimestamp(),
          });
          console.log('[Desktop MCP] Auto-registered:', publicUrl);
        } else {
          // Update endpoint (URL changes each tunnel restart)
          const existing = snap.docs[0];
          if (existing.data().endpoint !== publicUrl) {
            await updateDoc(
              doc(db, 'users', user.uid, 'customMcps', existing.id),
              { endpoint: publicUrl, updatedAt: serverTimestamp() }
            );
            console.log('[Desktop MCP] Updated tunnel URL:', publicUrl);
          }
        }
      } catch (err) {
        console.error('[Desktop MCP] Auto-register failed:', err);
      }
    };

    // Try to get the URL immediately (might already be ready)
    window.noomachy.getTunnelUrl().then((url) => {
      if (url) registerMcp(url);
    });

    // Subscribe to ready events for late initialization
    const unsubscribe = window.noomachy.onTunnelReady(registerMcp);
    return unsubscribe;
  }, []);
}
