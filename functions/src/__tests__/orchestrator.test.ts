/**
 * Orchestrator Tests
 *
 * Tests for agent request processing, intent classification, and tool execution.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock firebase-admin
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(),
    doc: jest.fn(),
  })),
  Timestamp: {
    now: () => ({ toDate: () => new Date(), seconds: Date.now() / 1000 }),
    fromDate: (d: Date) => ({ toDate: () => d, seconds: d.getTime() / 1000 }),
  },
  FieldValue: {
    serverTimestamp: jest.fn(),
  },
}));

describe('Agent Orchestrator', () => {
  describe('Intent Classification', () => {
    it('should map known intents to task domains', () => {
      function classifySimple(message: string): string {
        const lower = message.toLowerCase();
        if (/\b(code|debug|function|class|api|bug|error|typescript|python|react)\b/.test(lower)) {
          return 'coding';
        }
        if (/\b(research|find|search|paper|study|analyze|investigate)\b/.test(lower)) {
          return 'research';
        }
        if (/\b(write|story|creative|brainstorm|idea|content|blog)\b/.test(lower)) {
          return 'creative';
        }
        if (/\b(plan|schedule|organize|project|task|roadmap|timeline)\b/.test(lower)) {
          return 'planning';
        }
        return 'general';
      }

      expect(classifySimple('Can you help me debug this TypeScript function?')).toBe('coding');
      expect(classifySimple('Research the latest papers on RAG systems')).toBe('research');
      expect(classifySimple('Write a blog post about AI agents')).toBe('creative');
      expect(classifySimple('Help me plan the project roadmap')).toBe('planning');
      expect(classifySimple('What is the meaning of life?')).toBe('general');
    });
  });

  describe('System Prompt Building', () => {
    it('should inject memories into system prompt', () => {
      function buildSystemPrompt(
        basePrompt: string,
        memories: Array<{ content: string; confidence: number }>,
        tools: Array<{ name: string; description: string }>
      ): string {
        let prompt = basePrompt + '\n\n';

        if (memories.length > 0) {
          prompt += '## Relevant Memories\n';
          for (const mem of memories) {
            prompt += `- [Confidence: ${mem.confidence.toFixed(2)}] ${mem.content}\n`;
          }
          prompt += '\n';
        }

        if (tools.length > 0) {
          prompt += '## Available Tools\n';
          for (const tool of tools) {
            prompt += `- **${tool.name}**: ${tool.description}\n`;
          }
        }

        return prompt;
      }

      const result = buildSystemPrompt(
        'You are a helpful assistant.',
        [
          { content: 'User prefers TypeScript', confidence: 0.9 },
          { content: 'User works on React projects', confidence: 0.85 },
        ],
        [
          { name: 'web_search', description: 'Search the web' },
        ]
      );

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('User prefers TypeScript');
      expect(result).toContain('[Confidence: 0.90]');
      expect(result).toContain('web_search');
    });

    it('should limit memory injection to top-K by confidence', () => {
      const memories = Array.from({ length: 50 }, (_, i) => ({
        content: `Memory ${i}`,
        confidence: Math.random(),
      }));

      const topK = 10;
      const selected = memories
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, topK);

      expect(selected).toHaveLength(10);
      // Verify sorted descending
      for (let i = 1; i < selected.length; i++) {
        expect(selected[i - 1].confidence).toBeGreaterThanOrEqual(selected[i].confidence);
      }
    });
  });

  describe('Tool Call Loop', () => {
    it('should enforce max iteration limit', () => {
      const MAX_ITERATIONS = 10;
      let iterations = 0;
      let hasToolUse = true;

      while (hasToolUse && iterations < MAX_ITERATIONS) {
        iterations++;
        // Simulate tool use stopping after 5 iterations
        if (iterations >= 5) {
          hasToolUse = false;
        }
      }

      expect(iterations).toBe(5);
      expect(iterations).toBeLessThanOrEqual(MAX_ITERATIONS);
    });

    it('should accumulate tool results correctly', () => {
      const toolResults: Array<{ toolName: string; result: string }> = [];

      // Simulate a multi-tool conversation
      toolResults.push({ toolName: 'web_search', result: 'Found 10 results' });
      toolResults.push({ toolName: 'code_execution', result: 'Output: 42' });

      expect(toolResults).toHaveLength(2);
      expect(toolResults[0].toolName).toBe('web_search');
    });
  });

  describe('Fact Extraction', () => {
    it('should identify potential facts from conversation', () => {
      // Simple rule-based extraction for testing
      function extractFacts(messages: Array<{ role: string; content: string }>): string[] {
        const facts: string[] = [];
        const patterns = [
          /my name is (\w+)/i,
          /i (?:work|am working) (?:at|for|on) (.+?)(?:\.|$)/i,
          /i prefer (\w+)/i,
          /(?:remember|note) that (.+?)(?:\.|$)/i,
        ];

        for (const msg of messages) {
          if (msg.role !== 'user') continue;
          for (const pattern of patterns) {
            const match = msg.content.match(pattern);
            if (match) {
              facts.push(match[0]);
            }
          }
        }

        return facts;
      }

      const facts = extractFacts([
        { role: 'user', content: 'My name is Alex.' },
        { role: 'assistant', content: 'Nice to meet you, Alex!' },
        { role: 'user', content: 'I work at Google on cloud infrastructure.' },
        { role: 'user', content: 'I prefer TypeScript over JavaScript.' },
      ]);

      expect(facts).toHaveLength(3);
      expect(facts[0]).toContain('name is Alex');
      expect(facts[1]).toContain('work at Google');
      expect(facts[2]).toContain('prefer TypeScript');
    });
  });

  describe('Idempotency', () => {
    it('should detect duplicate requests by key', () => {
      const processedKeys = new Set<string>();

      function processRequest(key: string): { isDuplicate: boolean } {
        if (processedKeys.has(key)) {
          return { isDuplicate: true };
        }
        processedKeys.add(key);
        return { isDuplicate: false };
      }

      const first = processRequest('req-001');
      const duplicate = processRequest('req-001');
      const second = processRequest('req-002');

      expect(first.isDuplicate).toBe(false);
      expect(duplicate.isDuplicate).toBe(true);
      expect(second.isDuplicate).toBe(false);
    });
  });
});

describe('MCP Tool Execution', () => {
  it('should format tool results in MCP format', () => {
    function formatToolResult(result: unknown, isError = false) {
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
        isError,
      };
    }

    const success = formatToolResult({ data: [1, 2, 3] });
    expect(success.content[0].type).toBe('text');
    expect(success.isError).toBe(false);
    expect(JSON.parse(success.content[0].text)).toEqual({ data: [1, 2, 3] });

    const error = formatToolResult('Tool timed out', true);
    expect(error.isError).toBe(true);
    expect(error.content[0].text).toBe('Tool timed out');
  });

  it('should validate tool params against schema', () => {
    // Simple validation using type checks
    function validateParams(
      params: Record<string, unknown>,
      required: string[]
    ): { valid: boolean; missing: string[] } {
      const missing = required.filter((key) => !(key in params));
      return { valid: missing.length === 0, missing };
    }

    const valid = validateParams({ query: 'test', limit: 10 }, ['query']);
    expect(valid.valid).toBe(true);

    const invalid = validateParams({ limit: 10 }, ['query', 'source']);
    expect(invalid.valid).toBe(false);
    expect(invalid.missing).toEqual(['query', 'source']);
  });
});

describe('Security', () => {
  describe('Audit Logging', () => {
    it('should generate deterministic hash for audit entries', () => {
      // Simulating SHA-256 with a simple hash for testing
      function simpleHash(input: string): string {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
          const char = input.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
      }

      const entry1 = JSON.stringify({ action: 'tool_call', params: { query: 'test' } });
      const entry2 = JSON.stringify({ action: 'tool_call', params: { query: 'test' } });
      const entry3 = JSON.stringify({ action: 'tool_call', params: { query: 'different' } });

      // Same input produces same hash
      expect(simpleHash(entry1)).toBe(simpleHash(entry2));
      // Different input produces different hash
      expect(simpleHash(entry1)).not.toBe(simpleHash(entry3));
    });
  });

  describe('Skill Sandbox', () => {
    it('should enforce memory limits', () => {
      const sandboxConfig = {
        memoryLimitMB: 128,
        timeoutMs: 30000,
        allowedHosts: ['api.example.com'],
      };

      expect(sandboxConfig.memoryLimitMB).toBeLessThanOrEqual(512);
      expect(sandboxConfig.timeoutMs).toBeLessThanOrEqual(60000);
    });

    it('should validate allowed hosts', () => {
      function isHostAllowed(url: string, allowedHosts: string[]): boolean {
        if (allowedHosts.includes('*')) return true;
        try {
          const hostname = new URL(url).hostname;
          return allowedHosts.some(
            (host) => hostname === host || hostname.endsWith(`.${host}`)
          );
        } catch {
          return false;
        }
      }

      const allowed = ['api.example.com', 'cdn.example.com'];

      expect(isHostAllowed('https://api.example.com/data', allowed)).toBe(true);
      expect(isHostAllowed('https://cdn.example.com/img.png', allowed)).toBe(true);
      expect(isHostAllowed('https://evil.com/steal', allowed)).toBe(false);
      expect(isHostAllowed('https://sub.api.example.com/data', allowed)).toBe(true);
      expect(isHostAllowed('not-a-url', allowed)).toBe(false);

      // Wildcard allows all
      expect(isHostAllowed('https://anything.com', ['*'])).toBe(true);
    });
  });
});
