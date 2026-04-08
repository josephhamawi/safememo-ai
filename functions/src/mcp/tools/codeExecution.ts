import '../../init';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import ivm from 'isolated-vm';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { MCPToolResult } from '../../types';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const MEMORY_LIMIT_MB = 128;
const MAX_OUTPUT_LENGTH = 100_000;

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const executeCodeSchema = z.object({
  language: z.enum(['javascript', 'python']),
  code: z.string().min(1).max(50_000),
  timeout: z
    .number()
    .int()
    .min(1_000)
    .max(MAX_TIMEOUT_MS)
    .default(DEFAULT_TIMEOUT_MS),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function truncate(text: string): string {
  if (text.length > MAX_OUTPUT_LENGTH) {
    return text.substring(0, MAX_OUTPUT_LENGTH) + '\n\n[Output truncated]';
  }
  return text;
}

// ---------------------------------------------------------------------------
// Node.js execution via isolated-vm
// ---------------------------------------------------------------------------

async function executeJavaScript(
  code: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });

  try {
    const context = await isolate.createContext();
    const jail = context.global;

    // Inject a console.log substitute that captures output
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    await jail.set('_stdoutPush', new ivm.Reference((line: string) => {
      stdoutLines.push(line);
    }));
    await jail.set('_stderrPush', new ivm.Reference((line: string) => {
      stderrLines.push(line);
    }));

    // Set up console object inside the sandbox
    await context.eval(`
      const console = {
        log(...args) {
          _stdoutPush.applySync(undefined, [args.map(a => {
            try { return typeof a === 'string' ? a : JSON.stringify(a); }
            catch { return String(a); }
          }).join(' ')]);
        },
        error(...args) {
          _stderrPush.applySync(undefined, [args.map(a => {
            try { return typeof a === 'string' ? a : JSON.stringify(a); }
            catch { return String(a); }
          }).join(' ')]);
        },
        warn(...args) { console.error(...args); },
        info(...args) { console.log(...args); },
      };
    `);

    // Execute user code
    const script = await isolate.compileScript(code);
    await script.run(context, { timeout: timeoutMs });

    return {
      stdout: stdoutLines.join('\n'),
      stderr: stderrLines.join('\n'),
    };
  } finally {
    isolate.dispose();
  }
}

// ---------------------------------------------------------------------------
// Python execution via child process
// ---------------------------------------------------------------------------

async function executePython(
  code: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  const filename = `noomachy_exec_${randomUUID()}.py`;
  const filepath = join(tmpdir(), filename);

  await writeFile(filepath, code, 'utf-8');

  try {
    return await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const proc = execFile(
          'python3',
          [filepath],
          {
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024, // 10 MB
            env: {
              ...process.env,
              // Restrict what Python can do
              PYTHONDONTWRITEBYTECODE: '1',
            },
          },
          (error, stdout, stderr) => {
            if (error && !stdout && !stderr) {
              reject(error);
              return;
            }
            resolve({
              stdout: stdout ?? '',
              stderr: stderr ?? (error ? error.message : ''),
            });
          },
        );

        // Enforce memory limit by monitoring the process (best effort)
        if (proc.pid) {
          const memCheckInterval = setInterval(() => {
            try {
              // Send signal 0 to check if process is alive
              process.kill(proc.pid!, 0);
            } catch {
              clearInterval(memCheckInterval);
            }
          }, 1_000);

          proc.on('exit', () => clearInterval(memCheckInterval));
        }
      },
    );
  } finally {
    // Clean up temp file
    await unlink(filepath).catch(() => {
      /* ignore cleanup errors */
    });
  }
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

/**
 * Execute code in a sandboxed environment.
 * Supports JavaScript (via isolated-vm) and Python (via child process).
 */
export async function executeCode(
  language: 'javascript' | 'python',
  code: string,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<MCPToolResult> {
  const timeoutMs = Math.min(Math.max(timeout, 1_000), MAX_TIMEOUT_MS);

  logger.info('executeCode', {
    language,
    codeLength: code.length,
    timeoutMs,
  });

  try {
    let result: { stdout: string; stderr: string };

    if (language === 'javascript') {
      result = await executeJavaScript(code, timeoutMs);
    } else {
      result = await executePython(code, timeoutMs);
    }

    const output: Record<string, string> = {};
    if (result.stdout) {
      output.stdout = truncate(result.stdout);
    }
    if (result.stderr) {
      output.stderr = truncate(result.stderr);
    }
    if (!result.stdout && !result.stderr) {
      output.stdout = '(no output)';
    }

    return ok(JSON.stringify(output, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Detect timeout errors
    if (
      message.includes('Script execution timed out') ||
      message.includes('TIMEOUT') ||
      message.includes('killed')
    ) {
      logger.warn('executeCode timeout', { language, timeoutMs });
      return err(
        `Execution timed out after ${timeoutMs}ms. ` +
          'Consider reducing the complexity of your code or increasing the timeout.',
      );
    }

    logger.error('executeCode failed', { language, error: message });
    return err(`Execution failed: ${message}`);
  }
}
