/**
 * Slash command system: lets users type /<command> to expand into a longer
 * prompt before sending. Supports predefined built-ins and user-saved customs.
 */

export interface SlashCommand {
  name: string;          // slug (no spaces, lowercase)
  label: string;         // pretty display name
  description: string;   // what it does
  prompt: string;        // the actual expanded prompt sent to the agent
  category: 'system' | 'productivity' | 'communication' | 'utility' | 'custom';
  builtin: boolean;
}

export const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    name: 'summarize',
    label: 'Summarize current matter',
    description: 'Summarize what we know about the current matter from prior memory',
    prompt: 'Summarize everything in semantic memory about the current matter. Cite the memory IDs you used so I can audit each claim.',
    category: 'productivity',
    builtin: true,
  },
  {
    name: 'flags',
    label: 'Risk flags',
    description: 'Surface the risk clauses or red flags from prior memories',
    prompt: 'Search semantic memory for known risk clauses, prior contradictions, or rejected facts on this matter. Output as a numbered list with memory IDs.',
    category: 'productivity',
    builtin: true,
  },
  {
    name: 'precedent',
    label: 'Find precedent',
    description: 'Recall what we agreed on similar matters',
    prompt: 'Search semantic memory for prior matters with similar terms or parties. Show the strongest 3 with confidence scores and memory IDs.',
    category: 'productivity',
    builtin: true,
  },
  {
    name: 'pending',
    label: 'Pending validation',
    description: 'List memories awaiting human review',
    prompt: 'List every memory currently in the staging queue with its proposed content, similarity score against existing memories, and any contradiction flags.',
    category: 'utility',
    builtin: true,
  },
  {
    name: 'audit',
    label: 'Audit trail',
    description: 'Get the SHA-256 audit chain for the most recent memory',
    prompt: 'Show the SHA-256 hash chain and validation gate decisions for the most recently approved memory. Include who approved, when, and the previous hash.',
    category: 'utility',
    builtin: true,
  },
];

/**
 * Parse a message that might be a slash command.
 * Returns the parsed intent or null if not a slash command.
 */
export type ParsedCommand =
  | { type: 'set'; name: string; prompt: string }
  | { type: 'list' }
  | { type: 'invoke'; name: string }
  | { type: 'help' }
  | null;

export function parseSlashCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const body = trimmed.slice(1).trim();
  if (!body) return null;

  // /set <name> <prompt>
  if (body.toLowerCase().startsWith('set ') || body.toLowerCase() === 'set') {
    const rest = body.slice(3).trim();
    if (!rest) return { type: 'help' };
    // First token is the name (allow hyphens), rest is the prompt
    const match = rest.match(/^([a-z0-9-_]+)\s+(.+)$/i);
    if (!match) {
      // No prompt provided — treat the whole thing as the prompt and auto-slug
      const slug = slugify(rest);
      return { type: 'set', name: slug, prompt: rest };
    }
    return {
      type: 'set',
      name: slugify(match[1]),
      prompt: match[2].trim(),
    };
  }

  // /list or /commands
  if (body === 'list' || body === 'commands' || body === 'ls') {
    return { type: 'list' };
  }

  // /help
  if (body === 'help' || body === '?') {
    return { type: 'help' };
  }

  // /<command-name>
  const match = body.match(/^([a-z0-9-_]+)\s*$/i);
  if (match) {
    return { type: 'invoke', name: slugify(match[1]) };
  }

  return null;
}

/**
 * Convert any string into a clean slug usable as a command name.
 * "Mac Info" -> "mac-info"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Find a command by name across built-in and custom commands.
 */
export function findCommand(
  name: string,
  customCommands: SlashCommand[],
): SlashCommand | undefined {
  const slug = slugify(name);
  return (
    BUILTIN_COMMANDS.find((c) => c.name === slug) ||
    customCommands.find((c) => c.name === slug)
  );
}
