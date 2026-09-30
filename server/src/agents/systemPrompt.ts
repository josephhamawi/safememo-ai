import type { AgentConfig, MemoryContext } from './types';
import type { ToolDefinition } from './tools';

/**
 * Assemble the system prompt.
 *
 * Deliberately calmer than the Firebase-era version, which opened the tool
 * section with "CRITICAL: You have DIRECT ACCESS ... you MUST use them" and a
 * list of DO NOTs. That wording was written to push an older model into using
 * tools it was reluctant to touch; current models follow the system prompt
 * closely enough that the same text over-triggers — reaching for a tool when a
 * direct answer was wanted. Tools are described plainly here, and the formal
 * `tools` parameter does the real work.
 */
export function buildSystemPrompt(
  agent: AgentConfig,
  memories: MemoryContext,
  tools: ToolDefinition[],
): string {
  const sections: string[] = [];

  sections.push(
    agent.systemPrompt?.trim() ||
      'You are a helpful assistant with a durable, auditable memory.',
  );

  // Wall-clock context, refreshed per request, so the agent never burns a tool
  // call working out what day it is.
  const now = new Date();
  sections.push(
    [
      '<current_context>',
      `Current UTC datetime: ${now.toISOString()}`,
      `Day of week (UTC): ${now.toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: 'UTC',
      })}`,
      'Use this directly when asked about the current date or time.',
      '</current_context>',
    ].join('\n'),
  );

  if (memories.semantic.length > 0) {
    const lines = memories.semantic.map((m, i) => {
      const confidence =
        m.confidence != null ? ` (confidence ${m.confidence.toFixed(2)})` : '';
      return `  ${i + 1}. ${m.content}${confidence}`;
    });
    sections.push(
      [
        '<validated_memory>',
        'Facts about this user that passed human validation:',
        ...lines,
        '</validated_memory>',
      ].join('\n'),
    );
  }

  if (memories.episodic.length > 0) {
    const lines = memories.episodic.map((e, i) => `  ${i + 1}. ${e.summary}`);
    sections.push(
      ['<recent_episodes>', ...lines, '</recent_episodes>'].join('\n'),
    );
  }

  if (tools.length > 0) {
    sections.push(
      [
        '<tools_available>',
        'You can call these tools directly:',
        ...tools.map((t) => `  - ${t.name}: ${t.description}`),
        'Use one when it would get a better answer than reasoning alone.',
        '</tools_available>',
      ].join('\n'),
    );
  }

  sections.push(
    [
      '<memory_instructions>',
      'Note facts the user shares that are worth remembering long-term.',
      'Anything you note enters a validation queue for human review before it',
      'becomes permanent, so do not treat it as already remembered.',
      'Do not bring up the memory system unless the user asks about it.',
      '</memory_instructions>',
    ].join('\n'),
  );

  return sections.join('\n\n');
}
