import '../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, type Content, type Part, type FunctionDeclaration } from '@google/generative-ai';
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
import {
  assertWithinBudget,
  recordUsage,
  BudgetExceededError,
  MAX_LLM_OUTPUT_TOKENS,
} from '../cost/budgetGuard';

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TOOL_ITERATIONS = 10;
const INTENT_MODEL = 'claude-sonnet-4-6';
const AGENT_MODEL = 'claude-sonnet-4-6';
const GEMINI_MODEL = 'gemini-2.5-flash';

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Types used locally
// ---------------------------------------------------------------------------

interface MemoryContext {
  semanticMemories: SemanticMemory[];
  episodicMemories: EpisodicMemory[];
  workingMessages: Message[];
  behaviorInsights?: string[];
}

type ClaudeMessage = Anthropic.MessageParam;
type ClaudeTool = Anthropic.Tool;
type ContentBlock = Anthropic.ContentBlock;

/**
 * Retry an async operation with exponential backoff on transient errors
 * (overloaded, rate limits, 5xx). Total max wait: ~14 seconds.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes('overloaded') ||
        msg.includes('Overloaded') ||
        msg.includes('rate_limit') ||
        msg.includes('529') ||
        msg.includes('503') ||
        msg.includes('502');
      if (!retryable || attempt === maxAttempts - 1) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.warn(`Retryable error (attempt ${attempt + 1}/${maxAttempts}), waiting ${delay}ms: ${msg}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

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

  const client = new Anthropic({ apiKey: anthropicApiKey.value().trim() });

  // ------------------------------------------------------------------
  // 0. Budget guard — fail fast before any LLM call
  // ------------------------------------------------------------------
  await assertWithinBudget(message.userId);

  // ------------------------------------------------------------------
  // 1. Build system prompt & initial messages
  // ------------------------------------------------------------------
  const systemPrompt = buildSystemPrompt(agent, memories, tools);
  const cappedMaxTokens = Math.min(agent.modelConfig.maxTokens, MAX_LLM_OUTPUT_TOKENS);

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

    const response = await withRetry(() => client.messages.create({
      model: AGENT_MODEL,
      max_tokens: cappedMaxTokens,
      temperature: agent.modelConfig.temperature,
      ...(agent.modelConfig.topP != null ? { top_p: agent.modelConfig.topP } : {}),
      system: systemPrompt,
      messages: conversationMessages,
      ...(claudeTools.length > 0 ? { tools: claudeTools } : {}),
      stream: true,
    }));

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
    const fullResponse = await withRetry(() => client.messages.create({
      model: AGENT_MODEL,
      max_tokens: cappedMaxTokens,
      temperature: agent.modelConfig.temperature,
      ...(agent.modelConfig.topP != null ? { top_p: agent.modelConfig.topP } : {}),
      system: systemPrompt,
      messages: conversationMessages,
      ...(claudeTools.length > 0 ? { tools: claudeTools } : {}),
    }));

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
      await db.collection('agents').doc(agent.id).collection('stagingMemory').doc(memId).set({
        id: memId,
        agentId: agent.id,
        content: fact,
        embedding: [], // Embedding generation would be a separate pipeline step
        metadata: {
          source: 'conversation' as const,
          confidence: 0.95, // High confidence for Claude-extracted facts
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

  // Record Claude usage against the per-tenant daily cap
  await recordUsage({
    tenantId: message.userId,
    kind: 'claude',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  });

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
// Gemini processing
// ---------------------------------------------------------------------------

/**
 * Process a request using Gemini. Mirrors processRequest() but uses the
 * Google Generative AI SDK.
 */
export async function processRequestGemini(
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

  // Budget check (per-tenant daily cap, fails closed)
  await assertWithinBudget(message.userId);

  const genAI = new GoogleGenerativeAI(geminiApiKey.value().trim());
  const systemPrompt = buildSystemPrompt(agent, memories, tools);
  const cappedMaxTokens = Math.min(agent.modelConfig.maxTokens, MAX_LLM_OUTPUT_TOKENS);

  // Build Gemini tool declarations
  const geminiTools: FunctionDeclaration[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema as unknown as FunctionDeclaration['parameters'],
  }));

  // Build conversation history for Gemini
  const geminiHistory: Content[] = memories.workingMessages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: agent.modelConfig.temperature,
      maxOutputTokens: cappedMaxTokens,
    },
    ...(geminiTools.length > 0 ? { tools: [{ functionDeclarations: geminiTools }] } : {}),
  });

  const chat = model.startChat({ history: geminiHistory });

  let iterations = 0;
  let finalText = '';
  let streamIndex = 0;
  let currentParts: Part[] = [{ text: message.content }];

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const result = await chat.sendMessageStream(currentParts);
    let responseText = '';
    const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for await (const chunk of result.stream) {
      const text = chunk.text?.();
      if (text) {
        responseText += text;
        writeStreamToken(agent.id, conversationId, {
          conversationId,
          messageId,
          token: text,
          index: streamIndex++,
          done: false,
          timestamp: Timestamp.now(),
        }).catch((e) => logger.error('Failed to write stream token', e));
      }

      // Check for function calls in the chunk
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.functionCall) {
            functionCalls.push({
              name: part.functionCall.name,
              args: (part.functionCall.args ?? {}) as Record<string, unknown>,
            });
          }
        }
      }
    }

    // Get usage metadata
    const usageMetadata = await result.response.then((r) => r.usageMetadata);
    if (usageMetadata) {
      totalInputTokens += usageMetadata.promptTokenCount ?? 0;
      totalOutputTokens += usageMetadata.candidatesTokenCount ?? 0;
    }

    if (functionCalls.length === 0) {
      finalText = responseText;
      break;
    }

    // Execute tool calls
    const functionResponses: Part[] = [];
    for (const fc of functionCalls) {
      const toolStart = Date.now();
      logger.info('Executing tool (Gemini)', { tool: fc.name, agentId: agent.id });

      const mcpResult = await executeTool(fc.name, fc.args, agent.id, message.userId);
      const formatted = formatToolResult(mcpResult);
      const toolDuration = Date.now() - toolStart;

      allToolCalls.push({
        toolId: uuidv4(),
        toolName: fc.name,
        params: fc.args,
        result: formatted.content,
        duration: toolDuration,
        status: mcpResult.isError ? 'error' : 'success',
        timestamp: Timestamp.now(),
      });

      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: { result: formatted.content },
        },
      });
    }

    currentParts = functionResponses;
  }

  if (!finalText) {
    finalText = '[Agent reached maximum tool iterations without a final response]';
  }

  // Write done token
  await writeStreamToken(agent.id, conversationId, {
    conversationId, messageId, token: '', index: streamIndex, done: true, timestamp: Timestamp.now(),
  });

  const duration = Date.now() - startTime;

  // Log episode
  await logEpisode({
    episodeId: uuidv4(), agentId: agent.id, userId: message.userId,
    taskDomain: (message.metadata?.taskDomain as string) ?? 'general',
    sessionSnapshot: {
      sessionId: conversationId, messageCount: geminiHistory.length + 2,
      toolsUsed: allToolCalls.map((tc) => tc.toolName), summary: finalText.slice(0, 500),
    },
    outcome: allToolCalls.some((tc) => tc.status === 'error') ? 'partial' : 'success',
    lessonsLearned: [], toolCalls: allToolCalls, duration,
    consolidationScore: 0, promotedToSemantic: false, createdAt: Timestamp.now(),
  });

  // Record Gemini usage against the per-tenant daily cap
  await recordUsage({
    tenantId: message.userId,
    kind: 'gemini',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  });

  // Update working memory
  try {
    await updateWorkingMemory(agent, conversationId, message, finalText, allToolCalls);
  } catch (err) {
    logger.error('Failed to update working memory', err);
  }

  return {
    messageId, content: finalText, toolCalls: allToolCalls,
    memoryUpdates: { workingMemoryUpdated: true, episodicLogged: true, semanticStaged: [] },
    tokenUsage: { input: totalInputTokens, output: totalOutputTokens },
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

  // Wall-clock context — refreshed on every request so the agent always
  // knows "now" without resorting to web fetches or guessing.
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  sections.push(
    `\n<current_context>` +
    `\nCurrent UTC datetime: ${now.toISOString()}` +
    `\nUnix timestamp (seconds): ${Math.floor(now.getTime() / 1000)}` +
    `\nDay of week (UTC): ${weekday}` +
    `\nUse this when the user asks for the current time, date, or day. Do not call code_execute or web_fetch just to get the time.` +
    `\n</current_context>`,
  );

  // Learned behavior patterns (ML-style adaptive learning)
  if (memories.behaviorInsights && memories.behaviorInsights.length > 0) {
    sections.push(
      `\n<learned_user_patterns>` +
      `\nThe system has learned the following about this user from past interactions:` +
      `\n${memories.behaviorInsights.map((i) => `  - ${i}`).join('\n')}` +
      `\nAdapt your responses to match these preferences naturally.` +
      `\n</learned_user_patterns>`,
    );
  }

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
      `\n<tools_available>` +
      `\nCRITICAL: You have DIRECT ACCESS to the following tools. You MUST use them to fulfill user requests.` +
      `\nDO NOT say you lack access to email, calendar, notes, files, or system features when these tools are listed below.` +
      `\nDO NOT ask the user to provide email content — call the email tools directly.` +
      `\nDO NOT offer workarounds like "copy and paste" — use the tools to actually do the work.` +
      `\n\nAvailable tools:` +
      `\n${toolLines.join('\n')}` +
      `\n\nWhen the user asks you to check emails, read notes, check the calendar, manage reminders,` +
      `\nwork with files, or control their system — IMMEDIATELY call the appropriate tool from the list above.` +
      `\n</tools_available>`,
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
  const client = new Anthropic({ apiKey: anthropicApiKey.value().trim() });

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

  const response = await withRetry(() => client.messages.create({
    model: INTENT_MODEL,
    max_tokens: 1024,
    temperature: 0,
    system:
      'You are a fact extraction engine. Your ONLY job is to return a JSON array.\n\n' +
      'Extract concrete facts about the user from the conversation:\n' +
      '- Personal details (name, location, job, etc.)\n' +
      '- Preferences (likes, dislikes, favorite tools, etc.)\n' +
      '- Ongoing projects or goals\n' +
      '- Relationships or contacts mentioned\n' +
      '- Dates, numbers, or specific plans\n\n' +
      'STRICT OUTPUT RULES:\n' +
      '1. Return ONLY valid JSON array syntax, starting with [ and ending with ]\n' +
      '2. Each element is a short factual string in third person (e.g. "User lives in Beirut")\n' +
      '3. If no concrete facts found, return exactly: []\n' +
      '4. Do NOT include any prose, explanation, markdown, or text outside the array\n' +
      '5. Do NOT wrap in code fences\n\n' +
      'Example valid outputs:\n' +
      '["User prefers dark mode", "User works as a software engineer"]\n' +
      '[]',
    messages: [
      {
        role: 'user',
        content: `Extract facts from this conversation:\n\n${transcript}`,
      },
    ],
  }));

  const textContent = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );

  if (!textContent) return [];

  // Extract JSON array from the response, even if wrapped in prose
  const text = textContent.text.trim();
  const arrayMatch = text.match(/\[[\s\S]*?\]/);
  if (!arrayMatch) {
    logger.debug('No JSON array in extracted facts', { raw: text.slice(0, 200) });
    return [];
  }

  try {
    const facts = JSON.parse(arrayMatch[0]);
    if (Array.isArray(facts) && facts.every((f) => typeof f === 'string')) {
      return facts.filter((f) => f.trim().length > 0);
    }
    return [];
  } catch {
    logger.debug('Failed to parse extracted facts JSON', { raw: arrayMatch[0].slice(0, 200) });
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
  const client = new Anthropic({ apiKey: anthropicApiKey.value().trim() });

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

    // Append assistant message (omit toolCalls if empty — Firestore rejects undefined)
    const assistantMsg: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: assistantResponse,
      timestamp: now,
    };
    if (toolCalls.length > 0) assistantMsg.toolCalls = toolCalls;
    existingMessages.push(assistantMsg);

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
