'use client';

import { useCallback } from 'react';

import { commands as commandsApi } from '@/lib/api';
import type { SlashCommand } from '@/lib/slashCommands';
import { useAuth } from './useAuth';
import { useResource } from './useResource';

/** User-defined slash commands, stored server-side per account. */
export function useCustomCommands() {
  const { user } = useAuth();
  const { data, loading, refresh } = useResource(
    () => commandsApi.list(),
    [user?.id],
    { enabled: !!user },
  );

  const commands: SlashCommand[] = (data ?? []).map((c) => ({
    name: c.name,
    label: c.name,
    description: c.description || c.prompt.slice(0, 80),
    prompt: c.prompt,
    category: 'custom',
    builtin: false,
  }));

  const saveCommand = useCallback(
    async (name: string, prompt: string, _label?: string, description?: string) => {
      await commandsApi.save({
        name,
        prompt,
        ...(description ? { description } : {}),
      });
      await refresh();
    },
    [refresh],
  );

  const deleteCommand = useCallback(
    async (name: string) => {
      await commandsApi.remove(name);
      await refresh();
    },
    [refresh],
  );

  return { commands, loading, saveCommand, deleteCommand };
}
