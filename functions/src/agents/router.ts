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
import { processRequest } from './orchestrator';
import { classifyIntent } from './orchestrator';
import { getAvailableTools } from './mcpExecutor';

// ---------------------------------------------------------------------------
// Secrets & initialization
// ---------------------------------------------------------------------------

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const db = admin.firestore();

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

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
    secrets: [anthropicApiKey],
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

      // L2: Semantic long-term memories (top-K relevant)
      // In production this would use vector similarity search; here we
      // load the most recently accessed approved memories as a baseline.
      const semanticSnap = await db
        .collection('agents')
        .doc(agent.id)
        .collection('semanticMemories')
        .where('metadata.validationStatus', '==', 'approved')
        .orderBy('metadata.lastAccessed', 'desc')
        .limit(agent.memoryConfig.semanticSearchTopK)
        .get();

      const semanticMemories: SemanticMemory[] = semanticSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as SemanticMemory,
      );

      // L3: Recent episodic memories
      const episodicSnap = await db
        .collection('agents')
        .doc(agent.id)
        .collection('episodes')
        .orderBy('createdAt', 'desc')
        .limit(agent.memoryConfig.episodicSearchTopK)
        .get();

      const episodicMemories: EpisodicMemory[] = episodicSnap.docs.map(
        (d) => ({ ...d.data(), episodeId: d.data().episodeId ?? d.id }) as EpisodicMemory,
      );

      // L1: Working memory (recent conversation context)
      const workingMemSnap = await db
        .collection('agents')
        .doc(agent.id)
        .collection('workingMemory')
        .doc(conversationId)
        .get();

      const workingMessages: Message[] = workingMemSnap.exists
        ? (workingMemSnap.data()?.contextWindow as Message[]) ?? []
        : [];

      // ----------------------------------------------------------------
      // 7. Tool provisioning
      // ----------------------------------------------------------------
      const tools = await getAvailableTools(agent.enabledSkills);

      // ----------------------------------------------------------------
      // 8. Build request and call orchestrator
      // ----------------------------------------------------------------
      const agentRequest: AgentRequest = {
        message: normalizedMessage,
        agent,
        conversationId,
        idempotencyKey,
      };

      const agentResponse = await processRequest(
        agentRequest,
        { semanticMemories, episodicMemories, workingMessages },
        tools,
      );

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
          messageCount: admin.firestore.FieldValue.increment(2), // user + assistant
          updatedAt: Timestamp.now(),
          ...(!body.conversationId ? { createdAt: Timestamp.now() } : {}),
        },
        { merge: true },
      );

      // User message
      batch.set(convRef.collection('messages').doc(normalizedMessage.id), {
        id: normalizedMessage.id,
        role: 'user',
        content: normalizedMessage.content,
        timestamp: normalizedMessage.timestamp,
        metadata: normalizedMessage.metadata,
      });

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
      // 11. Return final response
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

      res.status(500).json({
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' ? { detail: message } : {}),
      });
    }
  },
);
