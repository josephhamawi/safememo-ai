import '../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { z, ZodError } from 'zod';
import type { MCPToolDefinition, MCPToolResult, Skill } from '../types';

import {
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  listFilesSchema,
  readFileSchema,
  writeFileSchema,
  deleteFileSchema,
} from './tools/fileOperations';

import {
  search,
  fetchUrl,
  searchSchema,
  fetchUrlSchema,
} from './tools/webSearch';

import { executeCode, executeCodeSchema } from './tools/codeExecution';

import {
  queryCollection,
  queryCollectionSchema,
} from './tools/databaseQuery';

import { getWeather, getWeatherSchema } from './tools/weather';
import { scheduleFollowup, scheduleFollowupSchema } from './tools/scheduleFollowup';

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolHandler = (params: Record<string, unknown>) => Promise<MCPToolResult>;

interface RegisteredTool {
  definition: MCPToolDefinition;
  handler: ToolHandler;
  schema: z.ZodType;
}

// ---------------------------------------------------------------------------
// Tool registry (module-level singleton)
// ---------------------------------------------------------------------------

const registry = new Map<string, RegisteredTool>();

function register(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: ToolHandler,
  schema: z.ZodType,
): void {
  registry.set(name, {
    definition: { name, description, inputSchema },
    handler,
    schema,
  });
}

// ---------------------------------------------------------------------------
// Built-in tool registration
// ---------------------------------------------------------------------------

export function registerBuiltinTools(): void {
  if (registry.size > 0) {
    return; // Already registered
  }

  // -- File operations ------------------------------------------------------

  register(
    'file_list',
    'List files in a user\'s storage folder',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Owner user ID' },
        path: {
          type: 'string',
          description: 'Relative folder path (default: root)',
          default: '',
        },
      },
      required: ['userId'],
    },
    async (params) => {
      const p = listFilesSchema.parse(params);
      return listFiles(p.userId, p.path);
    },
    listFilesSchema,
  );

  register(
    'file_read',
    'Read text content from a file in user storage',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Owner user ID' },
        path: { type: 'string', description: 'Relative file path' },
      },
      required: ['userId', 'path'],
    },
    async (params) => {
      const p = readFileSchema.parse(params);
      return readFile(p.userId, p.path);
    },
    readFileSchema,
  );

  register(
    'file_write',
    'Write text content to a file in user storage',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Owner user ID' },
        path: { type: 'string', description: 'Relative file path' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['userId', 'path', 'content'],
    },
    async (params) => {
      const p = writeFileSchema.parse(params);
      return writeFile(p.userId, p.path, p.content);
    },
    writeFileSchema,
  );

  register(
    'file_delete',
    'Delete a file from user storage',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Owner user ID' },
        path: { type: 'string', description: 'Relative file path' },
      },
      required: ['userId', 'path'],
    },
    async (params) => {
      const p = deleteFileSchema.parse(params);
      return deleteFile(p.userId, p.path);
    },
    deleteFileSchema,
  );

  // -- Web search -----------------------------------------------------------

  register(
    'web_search',
    'Search the web and return organic results',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        numResults: {
          type: 'number',
          description: 'Number of results (1-20, default 5)',
          default: 5,
        },
        userId: { type: 'string', description: 'User ID for rate limiting' },
      },
      required: ['query', 'userId'],
    },
    async (params) => {
      const p = searchSchema.parse(params);
      return search(p.query, p.numResults, p.userId);
    },
    searchSchema,
  );

  register(
    'web_fetch',
    'Fetch a URL and extract its text content',
    {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        userId: { type: 'string', description: 'User ID for rate limiting' },
      },
      required: ['url', 'userId'],
    },
    async (params) => {
      const p = fetchUrlSchema.parse(params);
      return fetchUrl(p.url, p.userId);
    },
    fetchUrlSchema,
  );

  // -- Code execution -------------------------------------------------------

  register(
    'code_execute',
    'Execute JavaScript or Python code in a sandboxed environment',
    {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['javascript', 'python'],
          description: 'Programming language',
        },
        code: { type: 'string', description: 'Source code to execute' },
        timeout: {
          type: 'number',
          description: 'Timeout in ms (default 30000, max 60000)',
          default: 30000,
        },
      },
      required: ['language', 'code'],
    },
    async (params) => {
      const p = executeCodeSchema.parse(params);
      return executeCode(p.language, p.code, p.timeout);
    },
    executeCodeSchema,
  );

  // -- Database query -------------------------------------------------------

  register(
    'db_query',
    'Execute a read-only Firestore query scoped to the user\'s data',
    {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'Owner user ID' },
        collection: {
          type: 'string',
          description:
            'Collection name (conversations, memories, episodes, agents, notifications, files)',
        },
        filters: {
          type: 'array',
          description: 'Array of where-clause objects { field, op, value }',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              op: {
                type: 'string',
                enum: [
                  '==', '!=', '<', '<=', '>', '>=',
                  'in', 'not-in', 'array-contains', 'array-contains-any',
                ],
              },
              value: {},
            },
            required: ['field', 'op', 'value'],
          },
          default: [],
        },
        orderBy: {
          type: 'object',
          description: 'Optional ordering { field, direction }',
          properties: {
            field: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
          },
        },
        startAfter: {
          description: 'Pagination cursor value',
        },
        limit: {
          type: 'number',
          description: 'Max results (1-100, default 20)',
          default: 20,
        },
      },
      required: ['userId', 'collection'],
    },
    async (params) => {
      const p = queryCollectionSchema.parse(params);
      return queryCollection(
        p.userId,
        p.collection,
        p.filters as Array<{ field: string; op: string; value: unknown }>,
        p.orderBy,
        p.startAfter,
        p.limit,
      );
    },
    queryCollectionSchema,
  );

  // -- Weather -------------------------------------------------------------

  register(
    'get_weather',
    'Get current weather conditions for any location worldwide',
    {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name, optionally with country (e.g. "London, UK", "Beirut")' },
        units: { type: 'string', enum: ['metric', 'imperial'], default: 'metric' },
      },
      required: ['location'],
    },
    async (params) => {
      const p = getWeatherSchema.parse(params);
      return getWeather(p.location, p.units);
    },
    getWeatherSchema,
  );

  // -- Auto-pilot: agent-initiated scheduling -----------------------------

  register(
    'schedule_followup',
    'Schedule a future task to run autonomously. Use when the user asks you to remind them, follow up later, or run something on a recurring schedule. The task fires by re-invoking you with the prompt at the scheduled time(s).',
    {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short label visible to the user (max 120 chars).',
        },
        prompt: {
          type: 'string',
          description: 'What you should do when the goal fires. Be specific and self-contained — you will receive only this prompt at run time.',
        },
        schedule: {
          type: 'string',
          description: 'When to run. Formats: "every 15m", "every 2h", "daily 08:30", "weekly Mon 09:00", or "once". Times are UTC unless the goal has a timezone configured.',
        },
      },
      required: ['title', 'prompt', 'schedule'],
    },
    async (params) => {
      const p = scheduleFollowupSchema.parse(params);
      return scheduleFollowup(p);
    },
    scheduleFollowupSchema,
  );

  logger.info('Built-in tools registered', { count: registry.size });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get tool definitions for a set of skill IDs, merged with built-in tools.
 * If skillIds is empty/undefined, returns only built-in tools.
 */
export async function getToolDefinitions(
  skillIds?: string[],
): Promise<MCPToolDefinition[]> {
  registerBuiltinTools();

  const definitions: MCPToolDefinition[] = [];

  // Add all built-in tool definitions
  for (const tool of registry.values()) {
    definitions.push(tool.definition);
  }

  // Load skill-based tools from Firestore if skill IDs are provided.
  // Skip skills that map to built-in tools (they're already registered).
  if (skillIds && skillIds.length > 0) {
    const builtinNames = new Set(Array.from(registry.keys()));
    try {
      const skillDocs = await Promise.all(
        skillIds.map((id) => db.collection('skills').doc(id).get()),
      );

      for (const doc of skillDocs) {
        if (!doc.exists) continue;
        const skill = doc.data() as Skill;

        // Skip if this skill maps to built-in tools (e.g. web_search, file_operations)
        if (skill.implementation?.hash === 'builtin') continue;

        // Only add external MCP skills with valid endpoints
        if (!skill.mcpEndpoint) continue;

        const toolName = `skill_${skill.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        definitions.push({
          name: toolName,
          description: `[Skill] ${skill.name}: ${skill.description}`,
          inputSchema: {
            type: 'object',
            description: `Invoke the "${skill.name}" skill (v${skill.version})`,
            properties: {
              action: { type: 'string', description: 'Action to perform' },
              params: {
                type: 'object',
                description: 'Action parameters',
              },
            },
            required: ['action'],
          },
        });
      }
    } catch (error) {
      logger.error('Failed to load skill definitions', { skillIds, error });
    }
  }

  return definitions;
}

/**
 * Validate parameters against the tool's zod schema.
 * Returns null if valid, or a descriptive error string.
 */
export function validateToolParams(
  toolName: string,
  params: Record<string, unknown>,
): string | null {
  registerBuiltinTools();

  const tool = registry.get(toolName);
  if (!tool) {
    return `Unknown tool: ${toolName}`;
  }

  try {
    tool.schema.parse(params);
    return null;
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      return `Invalid parameters: ${issues.join('; ')}`;
    }
    return `Validation error: ${String(error)}`;
  }
}

/**
 * Look up a registered tool handler by name.
 */
export function getToolHandler(
  toolName: string,
): ToolHandler | undefined {
  registerBuiltinTools();
  return registry.get(toolName)?.handler;
}

/**
 * Check if a tool name refers to a skill (external) rather than a built-in.
 */
export function isSkillTool(toolName: string): boolean {
  return toolName.startsWith('skill_');
}

/**
 * Extract the skill ID from a skill tool name.
 */
export function extractSkillId(toolName: string): string {
  return toolName.replace(/^skill_/, '');
}
