import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import type { MCPToolDefinition, MCPToolResult } from '../types';

const db = admin.firestore();

interface CustomMcp {
  id: string;
  name: string;
  endpoint: string;
  apiKey?: string | null;
  enabled: boolean;
}

// Cache custom MCP tool definitions for 5 minutes
const toolCache = new Map<string, { tools: MCPToolDefinition[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Map tool name → custom MCP endpoint (built per request)
const toolRouting = new Map<string, { endpoint: string; apiKey?: string | null; originalName: string }>();

/**
 * Sanitize a tool name to match Claude's pattern: ^[a-zA-Z0-9_-]{1,128}$
 */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

/**
 * Load all enabled custom MCPs for a user from Firestore.
 */
async function getUserCustomMcps(userId: string): Promise<CustomMcp[]> {
  try {
    const snap = await db
      .collection('users')
      .doc(userId)
      .collection('customMcps')
      .where('enabled', '==', true)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomMcp, 'id'>) }));
  } catch (err) {
    logger.warn('Failed to load custom MCPs', err);
    return [];
  }
}

/**
 * Fetch tool definitions from a custom MCP server's /tools/list endpoint.
 */
async function fetchMcpTools(mcp: CustomMcp): Promise<MCPToolDefinition[]> {
  const cached = toolCache.get(mcp.endpoint);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tools;
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (mcp.apiKey) headers['Authorization'] = `Bearer ${mcp.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${mcp.endpoint}/tools/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn(`Custom MCP /tools/list failed: ${mcp.name} (${res.status})`);
      return [];
    }

    const data = (await res.json()) as { tools?: MCPToolDefinition[] };
    const tools = data.tools ?? [];
    toolCache.set(mcp.endpoint, { tools, expiresAt: Date.now() + CACHE_TTL_MS });
    return tools;
  } catch (err) {
    logger.warn(`Failed to fetch tools from ${mcp.name}:`, err);
    return [];
  }
}

/**
 * Load all custom MCP tools for a user, with prefixed names to avoid collisions.
 * Returns the tool definitions and populates the routing table.
 */
export async function loadCustomMcpTools(userId: string): Promise<MCPToolDefinition[]> {
  const mcps = await getUserCustomMcps(userId);
  const allTools: MCPToolDefinition[] = [];

  for (const mcp of mcps) {
    const tools = await fetchMcpTools(mcp);
    for (const tool of tools) {
      // Use the raw tool name (e.g. "mail_read_inbox") - already valid
      const safeName = sanitizeToolName(tool.name);
      allTools.push({
        name: safeName,
        description: `[${mcp.name}] ${tool.description}`,
        inputSchema: tool.inputSchema,
      });
      toolRouting.set(safeName, {
        endpoint: mcp.endpoint,
        apiKey: mcp.apiKey,
        originalName: tool.name,
      });
    }
  }

  return allTools;
}

/**
 * Execute a custom MCP tool by routing to the registered endpoint.
 * Returns null if the tool isn't a custom MCP tool.
 */
export async function executeCustomMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<MCPToolResult | null> {
  const routing = toolRouting.get(toolName);
  if (!routing) return null;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (routing.apiKey) headers['Authorization'] = `Bearer ${routing.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${routing.endpoint}/tools/call`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: routing.originalName,
        arguments: args,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        content: [{ type: 'text', text: `Custom MCP error: ${res.status} ${res.statusText}` }],
        isError: true,
      };
    }

    return (await res.json()) as MCPToolResult;
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Custom MCP call failed: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

export function isCustomMcpTool(toolName: string): boolean {
  return toolRouting.has(toolName);
}
// cache buster 1775837917
