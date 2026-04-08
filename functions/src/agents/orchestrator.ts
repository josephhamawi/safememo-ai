import '../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import Anthropic from '@anthropic-ai/sdk';
import { defineSecret } from 'firebase-functions/params';
import { v4 as uuidv4 } from 'uuid';
import { Timestamp } from 'firebase-admin/firestore';

import {
  Agent,
  AgentRequest,
  AgentResponse,
  MCPToolDefinition,
  SemanticMemory,
  EpisodicMemory,
  ToolInvocation,
  StreamToken,
  Message,
} from '../types';
import { executeTool, formatToolResult } from './mcpExecutor';

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TOOL_ITERATIONS = 10;
const INTENT_MODEL = 'claude-sonnet-4-20250514';
const AGENT_MODEL = 'claude-sonnet-4-20250514';

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Types used locally
// ---------------------------------------------------------------------------

interface MemoryContext {
  semanticMemories: SemanticMemory[];
  episodicMemories: EpisodicMemory[];
  workingMessages: Message[];
}

type ClaudeMessage = Anthropic.MessageParam;
type ClaudeTool = Anthropic.Tool;
type ContentBlock = Anthropic.ContentBlock;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main processing entry point. Builds a prompt, calls Claude in a tool-use
 * loop, streams tokens to Firestore, logs the episode, and returns the
 * final response.
 */
export async function processRequest(
  request: AgentRequest,
  memories: MemoryContext,
  tools: MCPToolDefinition[],
): Promise<AgentResponse> {
  const { agent, message, conversationId } = request;
  const messageId = uuidv4();
  const allToolCalls: ToolInvocation[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const startTime = Date.now();

  const client = new Anthropic({ apiKey: anthropicApiKey.value() });

  // ------------------------------------------------------------------
  // 1. Build system prompt & initial messages
  // ------------------------------------------------------------------
  const systemPrompt = buildSystemPrompt(agent, memories, tools);

  const claudeTools: ClaudeTool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  const conversationMessages: ClaudeMessage[] = [
    // Inject recent working-memory messages for context continuity
    ...memories.workingMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    })),
    // Current user message
    { role: 'user' as const, content: message.content },
  ];

  // ------------------------------------------------------------------
  // 2. Tool-use loop
  // ------------------------------------------------------------------
  let iterations = 0;
  let finalText = '';
  let streamIndex = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: agent.modelConfig.maxTokens,
      temperature: agent.modelConfig.temperature,
      ...(agent.modelConfig.topP != null ? { top_p: agent.modelConfig.topP } : {}),
      system: systemPrompt,
      messages: conversationMessages,
      ...(claudeTools.length > 0 ? { tools: claudeTools } : {}),
      stream: true,
    });

    // Accumulate streamed response
    const contentBlocks: ContentBlock[] = [];
    let partialText = '';

    for await (const event of response) {
      // Track token usage from the final message_delta
      if (event.type === 'message_start' && event.message.usage) {
        totalInputTokens += event.message.usage.input_tokens;
      }
      if (event.type === 'message_delta') {
        totalOutputTokens += (event.usage as { output_tokens: number }).output_tokens;
      }

      // Stream text deltas to Firestore for real-time UI
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          partialText += event.delta.text;

          // Write stream token for real-time UI
          const tokenDoc: StreamToken = {
            conversationId,
            messageId,
            token: event.delta.text,
            index: streamIndex++,
            done: false,
            timestamp: Timestamp.now(),
          };
          writeStreamToken(agent.id, conversationId, tokenDoc).catch((e) =>
            logger.error('Failed to write stream token', e),
          );
        }
      }

      if (event.type === 'content_block_stop') {
        // We need to reconstruct the content block from accumulated data
        // The SDK provides the final blocks via message_stop
      }

      if (event.type === 'message_stop') {
        // Content blocks are finalized
      }
    }

    // Get the final accumulated message to inspect content blocks
    // Since we streamed, reconstruct from deltas. For tool use detection
    // we do a non-streaming follow-up check when we see tool_use in partial.
    // Better approach: use the streaming events to reconstruct blocks.

    // Re-fetch via non-stream to get structured blocks for tool routing.
    // This is only needed when partial text suggests tool use happened in streaming.
    // For correctness, we issue a parallel non-stream call.
    const fullResponse = await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: agent.modelConfig.maxTokens,
      temperature: agent.modelConfig.temperature,
      ...(agent.modelConfig.topP != null ? { top_p: agent.modelConfig.topP } : {}),
      system: systemPrompt,
      messages: conversationMessages,
      ...(claudeTools.length > 0 ? { tools: claudeTools } : {}),
    });

    totalInputTokens += fullResponse.usage.input_tokens;
    totalOutputTokens += fullResponse.usage.output_tokens;

    // Check if any tool_use blocks are present
    const toolUseBlocks = fullResponse.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const textBlocks = fullResponse.content.filter(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls: we have a final text response
      finalText = textBlocks.map((b) => b.text).join('\n');
      break;
    }

    // ------------------------------------------------------------------
    // 3. Execute tool calls
    // ------------------------------------------------------------------
    // Push assistant message with tool_use blocks
    conversationMessages.push({
      role: 'assistant',
      content: fullResponse.content as Anthropic.ContentBlockParam[],
    });

    // Execute each tool call and collect results
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const toolBlock of toolUseBlocks) {
      const toolStart = Date.now();
      logger.info('Executing tool', {
        tool: toolBlock.name,
        agentId: agent.id,
        userId: message.userId,
      });

      const mcpResult = await executeTool(
        toolBlock.name,
        toolBlock.input as Record<string, unknown>,
        agent.id,
        message.userId,
      );

      const formatted = formatToolResult(mcpResult);
      const toolDuration = Date.now() - toolStart;

      allToolCalls.push({
        toolId: toolBlock.id,
        toolName: toolBlock.name,
        params: toolBlock.input as Record<string, unknown>,
        result: formatted.content,
        duration: toolDuration,
        status: mcpResult.isError ? 'error' : 'success',
        timestamp: Timestamp.now(),
      });

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: formatted.content,
        ...(formatted.is_error ? { is_error: true } : {}),
      });
    }

    // Push tool results back into conversation
    conversationMessages.push({
      role: 'user',
      content: toolResultBlocks,
    });
  }

  // If we exhausted iterations without a final text response, use last partial
  if (!finalText) {
    finalText = '[Agent reached maximum tool iterations without a final response]';
  }

  // Write final "done" stream token
  const doneToken: StreamToken = {
    conversationId,
    messageId,
    token: '',
    index: streamIndex,
    done: true,
    timestamp: Timestamp.now(),
  };
  await writeStreamToken(agent.id, conversationId, doneToken);

  // ------------------------------------------------------------------
  // 4. Post-processing: memory operations
  // ------------------------------------------------------------------
  const duration = Date.now() - startTime;

  // Log episode to L3
  const episodeId = uuidv4();
  await logEpisode({
    episodeId,
    agentId: agent.id,
    userId: message.userId,
    taskDomain: (message.metadata?.taskDomain as string) ?? 'general',
    sessionSnapshot: {
      sessionId: conversationId,
      messageCount: conversationMessages.length,
      toolsUsed: allToolCalls.map((tc) => tc.toolName),
      summary: finalText.slice(0, 500),
    },
    outcome: allToolCalls.some((tc) => tc.status === 'error') ? 'partial' : 'success',
    lessonsLearned: [],
    toolCalls: allToolCalls,
    duration,
    consolidationScore: 0,
    promotedToSemantic: false,
    createdAt: Timestamp.now(),
  });

  // Check if any new facts should be staged for L2
  const stagedMemoryIds: string[] = [];
  try {
    const newFacts = await extractNewFacts(conversationMessages, agent, message.userId);
    for (const fact of newFacts) {
      const memId = uuidv4();
      await db.collection('agents').doc(agent.id).collection('stagingMemories').doc(memId).set({
        id: memId,
        agentId: agent.id,
        content: fact,
        embedding: [], // Embedding generation would be a separate pipeline step
        metadata: {
          source: 'conversation' as const,
          confidence: 0.7,
          validationStatus: 'staging' as const,
          tags: [],
          createdAt: Timestamp.now(),
          lastAccessed: Timestamp.now(),
          accessCount: 0,
        },
        accessControl: {
          ownerId: message.userId,
          visibility: 'private' as const,
          allowedUsers: [],
        },
        proposedBy: 'agent' as const,
        explanation: 'Automatically extracted from conversation',
        autoApprovalEligible: agent.memoryConfig.autoApprovalEnabled,
      });
      stagedMemoryIds.push(memId);
    }
  } catch (err) {
    logger.error('Failed to extract/stage new facts', err);
  }

  // Update L1 working memory
  try {
    await updateWorkingMemory(agent, conversationId, message, finalText, allToolCalls);
  } catch (err) {
    logger.error('Failed to update working memory', err);
  }

  // ------------------------------------------------------------------
  // 5. Return response
  // ------------------------------------------------------------------
  return {
    messageId,
    content: finalText,
    toolCalls: allToolCalls,
    memoryUpdates: {
      workingMemoryUpdated: true,
      episodicLogged: true,
      semanticStaged: stagedMemoryIds,
    },
    tokenUsage: {
      input: totalInputTokens,
      output: totalOutputTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Construct the full system prompt by injecting agent configuration,
 * relevant memories, and available tool descriptions.
 */
export function buildSystemPrompt(
  agent: Agent,
  memories: MemoryContext,
  tools: MCPToolDefinition[],
): string {
  const sections: string[] = [];

  // Base identity
  sections.push(agent.systemPrompt);

  // Agent metadata
  sections.push(
    `\n<agent_config>` +
    `\nAgent name: ${agent.name}` +
    `\nAgent type: ${agent.type}` +
    `\nDescription: ${agent.description}` +
    `\n</agent_config>`,
  );

  // L2 semantic memories
  if (memories.semanticMemories.length > 0) {
    const memoryLines = memories.semanticMemories.map(
      (m, i) => `  ${i + 1}. ${m.content} (confidence: ${m.metadata.confidence.toFixed(2)})`,
    );
    sections.push(
      `\n<long_term_memory>` +
      `\nRelevant facts you have learned:` +
      `\n${memoryLines.join('\n')}` +
      `\n</long_term_memory>`,
    );
  }

  // L3 episodic memories
  if (memories.episodicMemories.length > 0) {
    const episodeLines = memories.episodicMemories.map(
      (e, i) =>
        `  ${i + 1}. [${e.taskDomain}] ${e.sessionSnapshot.summary} ` +
        `(outcome: ${e.outcome}, tools: ${e.toolCalls.length})`,
    );
    sections.push(
      `\n<episodic_memory>` +
      `\nRecent relevant episodes:` +
      `\n${episodeLines.join('\n')}` +
      `\n</episodic_memory>`,
    );
  }

  // Tool descriptions for awareness (Claude also gets them as formal tools)
  if (tools.length > 0) {
    const toolLines = tools.map(
      (t) => `  - ${t.name}: ${t.description}`,
    );
    sections.push(
      `\n<available_tools>` +
      `\nYou have access to the following tools:` +
      `\n${toolLines.join('\n')}` +
      `\nUse tools when they help accomplish the user's request.` +
      `\n</available_tools>`,
    );
  }

  // Instructions for memory
  sections.push(
    `\n<memory_instructions>` +
    `\nPay attention to facts the user shares that may be worth remembering long-term.` +
    `\nDo not mention your memory system to the user unless they ask about it.` +
    `\n</memory_instructions>`,
  );

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Fact extraction
// ---------------------------------------------------------------------------

/**
 * Use Claude to identify new facts from the conversation that are worth
 * persisting to long-term semantic memory (L2).
 */
export async function extractNewFacts(
  conversation: ClaudeMessage[],
  agent: Agent,
  userId: string,
): Promise<string[]> {
  const client = new Anthropic({ apiKey: anthropicApiKey.value() });

  // Build a condensed transcript for analysis
  const transcript = conversation
    .map((m) => {
      const role = m.role;
      const text =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content
                .filter((b): b is Anthropic.TextBlockParam => (b as { type: string }).type === 'text')
                .map((b) => b.text)
                .join(' ')
            : '';
      return `${role}: ${text}`;
    })
    .join('\n');

  const response = await client.messages.create({
    model: INTENT_MODEL,
    max_tokens: 1024,
    temperature: 0,
    system:
      'You are a memory extraction assistant. Given a conversation transcript, ' +
      'identify discrete facts about the user that are worth remembering long-term. ' +
      'Only extract concrete, specific facts (preferences, personal details, project info, etc.). ' +
      'Return a JSON array of strings. If there are no new facts, return an empty array. ' +
      'Return ONLY the JSON array, no other text.',
    messages: [
      {
        role: 'user',
        content: `Extract memorable facts from this conversation:\n\n${transcript}`,
      },
    ],
  });

  const textContent = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );

  if (!textContent) return [];

  try {
    const facts = JSON.parse(textContent.text);
    if (Array.isArray(facts) && facts.every((f) => typeof f === 'string')) {
      return facts;
    }
    return [];
  } catch {
    logger.warn('Failed to parse extracted facts', { raw: textContent.text });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

/**
 * Classify a user message into a task domain using Claude.
 */
export async function classifyIntent(
  messageContent: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicApiKey.value() });

  const response = await client.messages.create({
    model: INTENT_MODEL,
    max_tokens: 100,
    temperature: 0,
    system:
      'You are an intent classifier. Given a user message, classify it into exactly one ' +
      'task domain. Respond with ONLY the domain name, nothing else.\n\n' +
      'Valid domains: general, code, research, creative, planning, memory, settings',
    messages: [{ role: 'user', content: messageContent }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );

  return textBlock?.text.trim().toLowerCase() ?? 'general';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Write a stream token to Firestore for real-time UI consumption.
 */
async function writeStreamToken(
  agentId: string,
  conversationId: string,
  token: StreamToken,
): Promise<void> {
  await db
    .collection('agents')
    .doc(agentId)
    .collection('conversations')
    .doc(conversationId)
    .collection('stream')
    .doc(uuidv4())
    .set(token);
}

/**
 * Log an episode to L3 episodic memory.
 */
async function logEpisode(episode: EpisodicMemory): Promise<void> {
  await db
    .collection('agents')
    .doc(episode.agentId)
    .collection('episodes')
    .doc(episode.episodeId)
    .set(episode);

  logger.info('Episode logged', {
    episodeId: episode.episodeId,
    agentId: episode.agentId,
    outcome: episode.outcome,
    duration: episode.duration,
    toolCallCount: episode.toolCalls.length,
  });
}

/**
 * Update L1 working memory with the latest exchange.
 */
async function updateWorkingMemory(
  agent: Agent,
  conversationId: string,
  userMessage: { userId: string; content: string },
  assistantResponse: string,
  toolCalls: ToolInvocation[],
): Promise<void> {
  const workingMemRef = db
    .collection('agents')
    .doc(agent.id)
    .collection('workingMemory')
    .doc(conversationId);

  const now = Timestamp.now();
  const maxMessages = agent.memoryConfig.maxWorkingMemoryMessages;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(workingMemRef);

    const existingMessages: Message[] = snap.exists
      ? (snap.data()?.contextWindow as Message[]) ?? []
      : [];

    // Append user message
    existingMessages.push({
      id: uuidv4(),
      role: 'user',
      content: userMessage.content,
      timestamp: now,
    });

    // Append assistant message
    existingMessages.push({
      id: uuidv4(),
      role: 'assistant',
      content: assistantResponse,
      timestamp: now,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // Trim to max size (keep most recent)
    const trimmed = existingMessages.slice(-maxMessages);

    tx.set(
      workingMemRef,
      {
        sessionId: conversationId,
        agentId: agent.id,
        userId: userMessage.userId,
        contextWindow: trimmed,
        activeTools: agent.enabledSkills,
        tempVariables: {},
        ttl: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000), // 24h
        syncStatus: 'synced',
        updatedAt: now,
        ...(snap.exists ? {} : { createdAt: now, deviceId: 'server' }),
      },
      { merge: true },
    );
  });
}
