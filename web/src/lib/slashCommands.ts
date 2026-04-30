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
  // System
  {
    name: 'mac-info',
    label: 'Mac Info',
    description: 'Get macOS system information (CPU, memory, disk, uptime)',
    prompt: 'Get my Mac system information including OS version, CPU, memory, disk usage, and uptime. Format as a clean summary.',
    category: 'system',
    builtin: true,
  },
  {
    name: 'clipboard',
    label: 'Read Clipboard',
    description: 'Show whatever is currently in my clipboard',
    prompt: 'Read my current clipboard content and show it to me.',
    category: 'system',
    builtin: true,
  },

  // Productivity
  {
    name: 'emails',
    label: 'Recent Emails',
    description: 'Check the last 10 emails in my inbox',
    prompt: 'Check my last 10 emails and give me a clean summary grouped by sender. Show subject, sender, and time for each.',
    category: 'communication',
    builtin: true,
  },
  {
    name: 'unread',
    label: 'Unread Emails',
    description: 'Show only unread emails',
    prompt: 'Search my emails for unread messages from the last 7 days and summarize them.',
    category: 'communication',
    builtin: true,
  },
  {
    name: 'today',
    label: "Today's Calendar",
    description: 'Show all events on my calendar today',
    prompt: 'What\'s on my calendar today? List all events with their times and locations.',
    category: 'productivity',
    builtin: true,
  },
  {
    name: 'week',
    label: "This Week's Schedule",
    description: 'Show my full week ahead',
    prompt: 'Show me my calendar events for the next 7 days.',
    category: 'productivity',
    builtin: true,
  },
  {
    name: 'reminders',
    label: 'Pending Reminders',
    description: 'List all my open reminders',
    prompt: 'List all my pending reminders that are not yet completed.',
    category: 'productivity',
    builtin: true,
  },
  {
    name: 'notes',
    label: 'Recent Notes',
    description: 'List my most recent notes from Apple Notes',
    prompt: 'List my 20 most recent notes from Apple Notes with their titles and last modified dates.',
    category: 'productivity',
    builtin: true,
  },

  // Utility
  {
    name: 'morning',
    label: 'Morning Briefing',
    description: 'Calendar + emails + reminders for the day',
    prompt: 'Give me a complete morning briefing: my calendar for today, my last 5 emails, and my pending reminders. Format it as a clean morning summary.',
    category: 'utility',
    builtin: true,
  },
  {
    name: 'focus',
    label: 'Focus Mode',
    description: 'What should I focus on right now',
    prompt: 'Based on my calendar, reminders, and recent emails, tell me what I should focus on right now. Be concise and actionable.',
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
