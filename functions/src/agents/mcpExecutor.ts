import '../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import {
  Skill,
  MCPToolDefinition,
  MCPToolResult,
  AuditLog,
} from '../types';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getToolHandler } from '../mcp/toolRegistry';
import { executeCustomMcpTool, isCustomMcpTool } from '../mcp/customMcp';

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/**
 * Route a tool call to the correct MCP handler, execute it, and return the
 * result in a shape that Claude can consume as a `tool_result` block.
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  agentId: string,
  userId: string,
): Promise<MCPToolResult> {
  const startTime = Date.now();
  let status: 'success' | 'error' = 'success';
  let result: MCPToolResult;

  // Inject userId into params for built-in tools that need it
  const enrichedParams = { ...params, userId: params.userId ?? userId };

  try {
    // 1. Try custom MCP routing first (e.g. desktop MCP tools like mail_read_inbox)
    if (isCustomMcpTool(toolName)) {
      const customResult = await executeCustomMcpTool(toolName, enrichedParams);
      if (customResult) {
        result = customResult;
        if (customResult.isError) status = 'error';
      } else {
        throw new Error(`Custom MCP returned no result for "${toolName}"`);
      }
    } else {
      // 2. Try built-in tool handler from the registry
      const handler = getToolHandler(toolName);
      if (handler) {
        result = await withTimeout(
          handler(enrichedParams),
          30_000,
          `Tool "${toolName}" exceeded timeout`,
        );
        if (result.isError) status = 'error';
      } else {
        throw new Error(`No handler found for tool "${toolName}"`);
      }
    }
  } catch (err: unknown) {
    status = 'error';
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Tool execution failed', { toolName, agentId, userId, error: message });

    result = {
      content: [{ type: 'text', text: `Error executing tool "${toolName}": ${message}` }],
      isError: true,
    };
  } finally {
    const duration = Date.now() - startTime;

    // Fire-and-forget audit log
    writeAuditLog({
      userId,
      agentId,
      action: `tool_execution:${toolName}`,
      skillId: toolName,
      params,
      status,
      duration,
    }).catch((e) => logger.error('Audit log write failed', e));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tool definition loading
// ---------------------------------------------------------------------------

/**
 * Given an array of skill IDs the agent has enabled, return all available
 * tool definitions: built-in tools (always) + external skill MCP tools.
 */
export async function getAvailableTools(
  skillIds: string[],
): Promise<MCPToolDefinition[]> {
  // Delegate to the central tool registry which handles built-ins + external skills
  const { getToolDefinitions } = await import('../mcp/toolRegistry');
  return getToolDefinitions(skillIds);
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

/**
 * Convert an MCPToolResult into the shape expected by Claude's
 * `tool_result` content block.
 */
export function formatToolResult(
  result: MCPToolResult,
): { type: 'tool_result'; content: string; is_error?: boolean } {
  // Flatten all text content blocks into a single string
  const text = result.content
    .map((block) => {
      if (block.type === 'text') return block.text ?? '';
      if (block.type === 'image') return `[image: ${block.mimeType}]`;
      if (block.type === 'resource') return block.text ?? '[resource]';
      return '';
    })
    .join('\n');

  return {
    type: 'tool_result',
    content: text,
    ...(result.isError ? { is_error: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Make an HTTP call to the skill's MCP endpoint.
 */
async function callMcpEndpoint(
  skill: Skill,
  toolName: string,
  params: Record<string, unknown>,
): Promise<MCPToolResult> {
  const endpoint = skill.mcpEndpoint;

  if (!endpoint) {
    throw new Error(`Skill "${skill.name}" has no mcpEndpoint configured`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params,
      },
      id: uuidv4(),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MCP endpoint returned ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    result?: MCPToolResult;
    error?: { message: string };
  };

  if (json.error) {
    throw new Error(`MCP error: ${json.error.message}`);
  }

  return json.result ?? { content: [{ type: 'text', text: '' }] };
}

/**
 * Fetch the input schema for a skill's tool from its MCP endpoint.
 * Falls back to an empty schema if the endpoint is unreachable.
 */
async function fetchToolSchema(
  skill: Skill,
): Promise<Record<string, unknown>> {
  try {
    if (!skill.mcpEndpoint) return {};

    const response = await fetch(skill.mcpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: uuidv4(),
      }),
    });

    if (!response.ok) return {};

    const json = (await response.json()) as {
      result?: { tools?: Array<{ name: string; inputSchema?: Record<string, unknown> }> };
    };

    const toolDef = json.result?.tools?.find((t) => t.name === skill.name);
    return toolDef?.inputSchema ?? {};
  } catch {
    logger.warn(`Could not fetch schema for skill "${skill.name}", using empty schema`);
    return {};
  }
}

/**
 * Promise wrapper that rejects after `ms` milliseconds.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Write an audit log entry to Firestore.
 */
async function writeAuditLog(
  entry: Omit<AuditLog, 'id' | 'timestamp' | 'resultHash'>,
): Promise<void> {
  const id = uuidv4();
  const auditLog: AuditLog = {
    id,
    ...entry,
    timestamp: Timestamp.now(),
  };
  await db.collection('auditLogs').doc(id).set(auditLog);
}

/**
 * Split an array into chunks of a given size.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
