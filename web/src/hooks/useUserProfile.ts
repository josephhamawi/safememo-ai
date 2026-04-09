'use client';

import { useAuth } from './useAuth';
import { useFirestoreDoc } from './useFirestoreCollection';
import type { UserProfile } from '@/types';

export function useUserProfile() {
  const { user } = useAuth();
  const { data, loading, error } = useFirestoreDoc<UserProfile>(
    user ? `users/${user.uid}` : '',
    !!user
  );
  return { profile: data, loading, error };
}
