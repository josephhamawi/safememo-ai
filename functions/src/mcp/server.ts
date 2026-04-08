import '../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';
import type { MCPToolResult, Skill } from '../types';
import {
  registerBuiltinTools,
  getToolDefinitions,
  validateToolParams,
  getToolHandler,
  isSkillTool,
  extractSkillId,
} from './toolRegistry';
import { SERPER_API_KEY } from './tools/webSearch';

const db = admin.firestore();
const MCP_SERVER_SECRET = defineSecret('MCP_SERVER_SECRET');

// ---------------------------------------------------------------------------
// Request validation schemas
// ---------------------------------------------------------------------------

const toolsListSchema = z.object({
  skillIds: z.array(z.string()).optional(),
});

const toolsCallSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  userId: z.string().min(1),
});

const resourcesListSchema = z.object({
  userId: z.string().min(1),
});

const resourcesReadSchema = z.object({
  uri: z.string().min(1),
  userId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(message: string): MCPToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function jsonResponse(data: unknown): MCPToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Authenticate the request using the MCP_SERVER_SECRET.
 * Expects `Authorization: Bearer <secret>` header.
 */
function authenticate(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
  return parts[1] === MCP_SERVER_SECRET.value();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleToolsList(
  body: unknown,
): Promise<MCPToolResult> {
  const params = toolsListSchema.parse(body);
  const definitions = await getToolDefinitions(params.skillIds);
  return jsonResponse({ tools: definitions });
}

async function handleToolsCall(
  body: unknown,
): Promise<MCPToolResult> {
  const params = toolsCallSchema.parse(body);
  const { name, arguments: args, userId } = params;

  // Always inject userId into arguments for scoping
  const scopedArgs = { ...args, userId };

  // Handle skill-based tools by forwarding to the skill's MCP endpoint
  if (isSkillTool(name)) {
    return handleSkillCall(extractSkillId(name), scopedArgs, userId);
  }

  // Validate params for built-in tools
  const validationError = validateToolParams(name, scopedArgs);
  if (validationError) {
    return errorResult(validationError);
  }

  // Look up and execute the handler
  const handler = getToolHandler(name);
  if (!handler) {
    return errorResult(`Unknown tool: ${name}`);
  }

  const startTime = Date.now();
  const result = await handler(scopedArgs);
  const duration = Date.now() - startTime;

  // Audit log
  await logToolCall(userId, name, scopedArgs, result, duration).catch(
    (err) => logger.error('Audit log failed', { error: err }),
  );

  return result;
}

async function handleResourcesList(
  body: unknown,
): Promise<MCPToolResult> {
  const params = resourcesListSchema.parse(body);
  const { userId } = params;

  // List available resources for this user
  const resources = [
    {
      uri: `noomachy://users/${userId}/agents`,
      name: 'User Agents',
      description: 'List of agents owned by this user',
      mimeType: 'application/json',
    },
    {
      uri: `noomachy://users/${userId}/conversations`,
      name: 'Conversations',
      description: 'User conversation history',
      mimeType: 'application/json',
    },
    {
      uri: `noomachy://users/${userId}/memories`,
      name: 'Semantic Memories',
      description: 'User\'s long-term semantic memories',
      mimeType: 'application/json',
    },
    {
      uri: `noomachy://users/${userId}/files`,
      name: 'User Files',
      description: 'Files in user\'s cloud storage',
      mimeType: 'application/json',
    },
  ];

  return jsonResponse({ resources });
}

async function handleResourcesRead(
  body: unknown,
): Promise<MCPToolResult> {
  const params = resourcesReadSchema.parse(body);
  const { uri, userId } = params;

  // Parse the noomachy:// URI
  const uriPattern = /^noomachy:\/\/users\/([^/]+)\/([^/]+)(?:\/(.+))?$/;
  const match = uri.match(uriPattern);

  if (!match) {
    return errorResult(`Invalid resource URI: ${uri}`);
  }

  const [, resourceUserId, resourceType, resourceId] = match;

  // Enforce user scope: users can only read their own resources
  if (resourceUserId !== userId) {
    return errorResult('Access denied: cannot read another user\'s resources');
  }

  try {
    switch (resourceType) {
      case 'agents': {
        if (resourceId) {
          const doc = await db
            .collection('users')
            .doc(userId)
            .collection('agents')
            .doc(resourceId)
            .get();
          if (!doc.exists) return errorResult('Agent not found');
          return jsonResponse({ id: doc.id, ...doc.data() });
        }
        const snapshot = await db
          .collection('users')
          .doc(userId)
          .collection('agents')
          .limit(50)
          .get();
        const agents = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        return jsonResponse(agents);
      }

      case 'conversations': {
        if (resourceId) {
          const doc = await db
            .collection('users')
            .doc(userId)
            .collection('conversations')
            .doc(resourceId)
            .get();
          if (!doc.exists) return errorResult('Conversation not found');
          return jsonResponse({ id: doc.id, ...doc.data() });
        }
        const snapshot = await db
          .collection('users')
          .doc(userId)
          .collection('conversations')
          .orderBy('updatedAt', 'desc')
          .limit(50)
          .get();
        const convos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        return jsonResponse(convos);
      }

      case 'memories': {
        if (resourceId) {
          const doc = await db
            .collection('users')
            .doc(userId)
            .collection('memories')
            .doc(resourceId)
            .get();
          if (!doc.exists) return errorResult('Memory not found');
          return jsonResponse({ id: doc.id, ...doc.data() });
        }
        const snapshot = await db
          .collection('users')
          .doc(userId)
          .collection('memories')
          .orderBy('metadata.lastAccessed', 'desc')
          .limit(50)
          .get();
        const memories = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        return jsonResponse(memories);
      }

      case 'files': {
        const storage = admin.storage().bucket();
        const prefix = `users/${userId}/`;
        const [files] = await storage.getFiles({ prefix, autoPaginate: true });
        const fileList = files.map((f) => ({
          name: f.name.replace(prefix, ''),
          size: f.metadata.size,
          updated: f.metadata.updated,
        }));
        return jsonResponse(fileList);
      }

      default:
        return errorResult(`Unknown resource type: ${resourceType}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Resource read failed', { uri, error: message });
    return errorResult(`Failed to read resource: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Skill delegation
// ---------------------------------------------------------------------------

/**
 * Forward a tool call to a sandboxed skill's MCP endpoint.
 */
async function handleSkillCall(
  skillId: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  try {
    const skillDoc = await db.collection('skills').doc(skillId).get();
    if (!skillDoc.exists) {
      return errorResult(`Skill not found: ${skillId}`);
    }

    const skill = skillDoc.data() as Skill;

    // Verify the skill's trust score meets minimum threshold
    if (skill.trustScore < 0.5) {
      return errorResult(
        `Skill "${skill.name}" has insufficient trust score (${skill.trustScore})`,
      );
    }

    // Forward to the skill's MCP endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      skill.sandboxConfig.timeoutMs || 30_000,
    );

    const response = await fetch(skill.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MCP_SERVER_SECRET.value()}`,
      },
      body: JSON.stringify({
        method: 'tools/call',
        params: { name: skill.name, arguments: args },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      logger.error('Skill call failed', {
        skillId,
        status: response.status,
        body,
      });
      return errorResult(
        `Skill "${skill.name}" returned HTTP ${response.status}`,
      );
    }

    const result = (await response.json()) as MCPToolResult;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Skill call error', { skillId, error: message });
    return errorResult(`Skill execution failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

async function logToolCall(
  userId: string,
  toolName: string,
  params: Record<string, unknown>,
  result: MCPToolResult,
  duration: number,
): Promise<void> {
  await db.collection('auditLogs').add({
    userId,
    action: `mcp.tools.call.${toolName}`,
    params,
    resultHash: null, // Could be computed if needed
    status: result.isError ? 'error' : 'success',
    duration,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Cloud Function export
// ---------------------------------------------------------------------------

export const mcpServer = onRequest(
  {
    secrets: [MCP_SERVER_SECRET, SERPER_API_KEY],
    cors: false,
    maxInstances: 100,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.status(405).json(errorResult('Method not allowed'));
      return;
    }

    // Authenticate
    if (!authenticate(req.headers.authorization)) {
      res.status(401).json(errorResult('Unauthorized: invalid or missing secret'));
      return;
    }

    // Ensure built-in tools are registered
    registerBuiltinTools();

    // Route based on path
    const path = req.path;

    try {
      let result: MCPToolResult;

      switch (path) {
        case '/tools/list':
          result = await handleToolsList(req.body);
          break;

        case '/tools/call':
          result = await handleToolsCall(req.body);
          break;

        case '/resources/list':
          result = await handleResourcesList(req.body);
          break;

        case '/resources/read':
          result = await handleResourcesRead(req.body);
          break;

        default:
          res.status(404).json(errorResult(`Unknown endpoint: ${path}`));
          return;
      }

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        );
        res.status(400).json(errorResult(`Validation error: ${issues.join('; ')}`));
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error('MCP server error', { path, error: message });
      res.status(500).json(errorResult(`Internal error: ${message}`));
    }
  },
);
