import '../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { v4 as uuidv4 } from 'uuid';
import { Timestamp } from 'firebase-admin/firestore';

import {
  Agent,
  AgentRequest,
  NormalizedMessage,
  SemanticMemory,
  EpisodicMemory,
  Message,
} from '../types';
import { processRequest, processRequestGemini } from './orchestrator';
import { classifyIntent } from './orchestrator';
import { getAvailableTools } from './mcpExecutor';
import { loadCustomMcpTools } from '../mcp/customMcp';
import { loadBehaviorProfile, updateBehaviorProfile } from '../memory/behaviorLearning';

// ---------------------------------------------------------------------------
// Secrets & initialization
// ---------------------------------------------------------------------------

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const openWeatherApiKey = defineSecret('OPENWEATHER_API_KEY');

const db = admin.firestore();

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://noomachy.com',
  'https://www.noomachy.com',
  'https://noomachy.web.app',
  'https://noomachy.firebaseapp.com',
];

function setCorsHeaders(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { setHeader: (name: string, value: string) => void },
): void {
  const origin = (req.headers['origin'] as string) ?? '';
  if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.noomachy.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '3600');
}

// ---------------------------------------------------------------------------
// Cloud Function: agentRouter
// ---------------------------------------------------------------------------

export const agentRouter = onRequest(
  {
    secrets: [anthropicApiKey, geminiApiKey, openWeatherApiKey],
    timeoutSeconds: 300,
    memory: '1GiB',
    region: 'us-central1',
    maxInstances: 100,
  },
  async (req, res) => {
    // ----------------------------------------------------------------
    // CORS
    // ----------------------------------------------------------------
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // ----------------------------------------------------------------
      // 1. Authenticate
      // ----------------------------------------------------------------
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      let decodedToken: admin.auth.DecodedIdToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        logger.warn('Auth token verification failed', err);
        res.status(401).json({ error: 'Invalid or expired auth token' });
        return;
      }

      const userId = decodedToken.uid;

      // ----------------------------------------------------------------
      // 2. Parse request body into NormalizedMessage
      // ----------------------------------------------------------------
      const body = req.body as {
        agentId?: string;
        conversationId?: string;
        content?: string;
        source?: string;
        attachments?: Array<{
          id: string;
          type: 'image' | 'file' | 'audio' | 'video';
          url: string;
          mimeType: string;
          size: number;
          name: string;
        }>;
        idempotencyKey?: string;
        metadata?: Record<string, unknown>;
      };

      if (!body.agentId || !body.content) {
        res.status(400).json({ error: 'agentId and content are required' });
        return;
      }

      const conversationId = body.conversationId ?? uuidv4();
      const idempotencyKey = body.idempotencyKey ?? uuidv4();

      const normalizedMessage: NormalizedMessage = {
        id: uuidv4(),
        source: (body.source as NormalizedMessage['source']) ?? 'web',
        userId,
        agentId: body.agentId,
        content: body.content,
        attachments: body.attachments ?? [],
        timestamp: Timestamp.now(),
        metadata: body.metadata ?? {},
      };

      // ----------------------------------------------------------------
      // 3. Idempotency check
      // ----------------------------------------------------------------
      const idempotencyRef = db.collection('idempotencyKeys').doc(idempotencyKey);
      const idempotencySnap = await idempotencyRef.get();

      if (idempotencySnap.exists) {
        const cached = idempotencySnap.data();
        logger.info('Idempotent request detected, returning cached response', {
          idempotencyKey,
        });
        res.status(200).json(cached?.response ?? { error: 'Cached response unavailable' });
        return;
      }

      // Reserve the idempotency key immediately to prevent races
      await idempotencyRef.set({
        status: 'processing',
        userId,
        agentId: body.agentId,
        createdAt: Timestamp.now(),
      });

      // ----------------------------------------------------------------
      // 4. Intent classification
      // ----------------------------------------------------------------
      let taskDomain: string;
      try {
        taskDomain = await classifyIntent(normalizedMessage.content);
      } catch (err) {
        logger.error('Intent classification failed, defaulting to general', err);
        taskDomain = 'general';
      }

      normalizedMessage.metadata.taskDomain = taskDomain;

      // ----------------------------------------------------------------
      // 5. Agent selection / config loading
      // ----------------------------------------------------------------
      const agentDoc = await db.collection('agents').doc(body.agentId).get();

      if (!agentDoc.exists) {
        await idempotencyRef.delete();
        res.status(404).json({ error: `Agent "${body.agentId}" not found` });
        return;
      }

      const agent = { id: agentDoc.id, ...agentDoc.data() } as Agent;

      // Verify the user owns or has access to this agent
      if (agent.ownerId !== userId) {
        await idempotencyRef.delete();
        res.status(403).json({ error: 'You do not have access to this agent' });
        return;
      }

      if (agent.status !== 'active') {
        await idempotencyRef.delete();
        res.status(400).json({ error: `Agent is ${agent.status}` });
        return;
      }

      // ----------------------------------------------------------------
      // 6. Memory hydration
      // ----------------------------------------------------------------

      // Memory hydration is best-effort — if queries fail (e.g. missing
      // index), continue with empty memories rather than crashing.
      let semanticMemories: SemanticMemory[] = [];
      let episodicMemories: EpisodicMemory[] = [];
      let workingMessages: Message[] = [];

      try {
        const semanticSnap = await db
          .collection('agents')
          .doc(agent.id)
          .collection('semanticMemory')
          .where('metadata.validationStatus', '==', 'approved')
          .orderBy('metadata.lastAccessed', 'desc')
          .limit(agent.memoryConfig.semanticSearchTopK)
          .get();
        semanticMemories = semanticSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as SemanticMemory,
        );
      } catch (memErr) {
        logger.warn('Semantic memory hydration failed (non-fatal)', memErr);
      }

      try {
        const episodicSnap = await db
          .collection('agents')
          .doc(agent.id)
          .collection('episodicMemory')
          .orderBy('createdAt', 'desc')
          .limit(agent.memoryConfig.episodicSearchTopK)
          .get();
        episodicMemories = episodicSnap.docs.map(
          (d) => ({ ...d.data(), episodeId: d.data().episodeId ?? d.id }) as EpisodicMemory,
        );
      } catch (memErr) {
        logger.warn('Episodic memory hydration failed (non-fatal)', memErr);
      }

      try {
        const workingMemSnap = await db
          .collection('agents')
          .doc(agent.id)
          .collection('workingMemory')
          .doc(conversationId)
          .get();
        workingMessages = workingMemSnap.exists
          ? (workingMemSnap.data()?.contextWindow as Message[]) ?? []
          : [];
      } catch (memErr) {
        logger.warn('Working memory hydration failed (non-fatal)', memErr);
      }

      // ----------------------------------------------------------------
      // 7. Tool provisioning (built-in skills + custom MCPs)
      // ----------------------------------------------------------------
      const builtinTools = await getAvailableTools(agent.enabledSkills);
      const customMcpTools = await loadCustomMcpTools(userId);
      const tools = [...builtinTools, ...customMcpTools];
      logger.info(`Loaded ${builtinTools.length} built-in + ${customMcpTools.length} custom MCP tools`);

      // ----------------------------------------------------------------
      // 8. Build request and call orchestrator
      // ----------------------------------------------------------------
      const agentRequest: AgentRequest = {
        message: normalizedMessage,
        agent,
        conversationId,
        idempotencyKey,
      };

      // Load learned behavior patterns for the user (ML-style adaptive learning)
      let behaviorInsights: string[] = [];
      try {
        const profile = await loadBehaviorProfile(userId);
        behaviorInsights = profile.insights || [];
      } catch (memErr) {
        logger.warn('Behavior profile load failed (non-fatal)', memErr);
      }

      const memoryContext = { semanticMemories, episodicMemories, workingMessages, behaviorInsights };
      let agentResponse;
      if (agent.model === 'gemini') {
        try {
          agentResponse = await processRequestGemini(agentRequest, memoryContext, tools);
        } catch (geminiErr) {
          logger.warn('Gemini failed, falling back to Claude', geminiErr);
          agentResponse = await processRequest(agentRequest, memoryContext, tools);
        }
      } else {
        agentResponse = await processRequest(agentRequest, memoryContext, tools);
      }

      // ----------------------------------------------------------------
      // 9. Persist conversation message records
      // ----------------------------------------------------------------
      const convRef = db
        .collection('agents')
        .doc(agent.id)
        .collection('conversations')
        .doc(conversationId);

      const batch = db.batch();

      // Upsert conversation document
      batch.set(
        convRef,
        {
          id: conversationId,
          agentId: agent.id,
          userId,
          title: normalizedMessage.content.slice(0, 100),
          source: normalizedMessage.source,
          messageCount: admin.firestore.FieldValue.increment(1), // assistant only (user written by client)
          updatedAt: Timestamp.now(),
          ...(!body.conversationId ? { createdAt: Timestamp.now() } : {}),
        },
        { merge: true },
      );

      // User message is written by the client (web app) before calling this
      // function, so we only persist the assistant response here.

      // Assistant message
      batch.set(convRef.collection('messages').doc(agentResponse.messageId), {
        id: agentResponse.messageId,
        role: 'assistant',
        content: agentResponse.content,
        timestamp: Timestamp.now(),
        toolCalls: agentResponse.toolCalls,
        tokenUsage: agentResponse.tokenUsage,
      });

      await batch.commit();

      // ----------------------------------------------------------------
      // 10. Update idempotency record with final response
      // ----------------------------------------------------------------
      await idempotencyRef.set({
        status: 'completed',
        userId,
        agentId: agent.id,
        response: agentResponse,
        createdAt: Timestamp.now(),
        completedAt: Timestamp.now(),
      });

      // ----------------------------------------------------------------
      // 11. Update behavior learning (fire-and-forget)
      // ----------------------------------------------------------------
      updateBehaviorProfile({
        userId,
        userMessage: normalizedMessage.content,
        assistantResponse: agentResponse.content,
        toolsUsed: agentResponse.toolCalls.map((tc) => tc.toolName),
        taskDomain,
      }).catch((e) => logger.warn('Behavior profile update failed', e));

      // ----------------------------------------------------------------
      // 12. Return final response
      // ----------------------------------------------------------------
      logger.info('Agent request completed', {
        agentId: agent.id,
        userId,
        conversationId,
        taskDomain,
        toolCalls: agentResponse.toolCalls.length,
        inputTokens: agentResponse.tokenUsage.input,
        outputTokens: agentResponse.tokenUsage.output,
      });

      res.status(200).json(agentResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      logger.error('agentRouter unhandled error', { error: message, stack });

      // Translate common API errors into user-friendly messages
      let userError = 'Internal server error';
      let statusCode = 500;
      if (message.includes('overloaded_error') || message.includes('Overloaded')) {
        userError = 'The AI model is currently overloaded. Please try again in a moment.';
        statusCode = 503;
      } else if (message.includes('rate_limit')) {
        userError = 'Rate limit reached. Please wait a moment before sending another message.';
        statusCode = 429;
      } else if (message.includes('invalid_api_key') || message.includes('authentication')) {
        userError = 'AI provider authentication failed. Check API key configuration.';
        statusCode = 502;
      }

      res.status(statusCode).json({
        error: userError,
        ...(process.env.NODE_ENV !== 'production' ? { detail: message } : {}),
      });
    }
  },
);
// touch 1775810766
