import ivm from 'isolated-vm';
import { logger } from 'firebase-functions/v2';
import { Skill } from '../types';

// ============================================================
// Types
// ============================================================

export interface SandboxContext {
  userId: string;
  agentId: string;
  sessionId: string;
}

export interface SandboxResult {
  success: boolean;
  data: unknown;
  logs: string[];
  durationMs: number;
}

// ============================================================
// Sandboxed fetch - only allow listed hosts
// ============================================================

/**
 * Create a fetch wrapper that is restricted to the skill's allowedHosts.
 * This runs in the Node host; the isolate calls it via a reference.
 */
function createRestrictedFetch(allowedHosts: string[]): (urlStr: string, optionsJson: string) => Promise<string> {
  return async (urlStr: string, optionsJson: string): Promise<string> => {
    const url = new URL(urlStr);
    if (!allowedHosts.includes(url.hostname)) {
      throw new Error(`Host not allowed: ${url.hostname}. Allowed: ${allowedHosts.join(', ')}`);
    }

    const options = optionsJson ? JSON.parse(optionsJson) : {};
    const res = await fetch(urlStr, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const body = await res.text();
    return JSON.stringify({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body,
    });
  };
}

// ============================================================
// Main entry point
// ============================================================

/**
 * Execute a skill's code inside an isolated-vm sandbox.
 *
 * The skill implementation is loaded from the `skill.implementation.storagePath`
 * (the caller must resolve and pass the actual source code string).
 *
 * @param skill - The skill definition with sandbox config
 * @param params - Parameters to pass to the skill's `run(params, context)` export
 * @param context - Execution context (user, agent, session)
 * @param sourceCode - The skill's JavaScript source (pre-fetched from Storage)
 */
export async function executeSkillSandboxed(
  skill: Skill,
  params: Record<string, unknown>,
  context: SandboxContext,
  sourceCode: string,
): Promise<SandboxResult> {
  const startTime = Date.now();
  const collectedLogs: string[] = [];

  let isolate: ivm.Isolate | null = null;

  try {
    // ---- Create isolate with memory limit ----
    const memoryLimitMB = skill.sandboxConfig.memoryLimitMB || 128;
    isolate = new ivm.Isolate({ memoryLimit: memoryLimitMB });

    const ivmContext = await isolate.createContext();

    // ---- Inject console.log ----
    const jail = ivmContext.global;
    await jail.set('global', jail.derefInto());

    // console.log - captures logs and forwards to host
    const logCallback = new ivm.Reference((...args: unknown[]) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      collectedLogs.push(message);
      logger.debug(`[sandbox:${skill.id}] ${message}`);
    });
    await jail.set('_log', logCallback);

    await ivmContext.eval(`
      const console = {
        log: (...args) => _log.applySync(undefined, args.map(a => typeof a === 'string' ? a : JSON.stringify(a))),
        warn: (...args) => _log.applySync(undefined, ['[WARN]', ...args.map(a => typeof a === 'string' ? a : JSON.stringify(a))]),
        error: (...args) => _log.applySync(undefined, ['[ERROR]', ...args.map(a => typeof a === 'string' ? a : JSON.stringify(a))]),
        info: (...args) => _log.applySync(undefined, args.map(a => typeof a === 'string' ? a : JSON.stringify(a))),
      };
    `);

    // ---- Inject restricted fetch ----
    const allowedHosts = skill.sandboxConfig.allowedHosts || [];
    const restrictedFetchFn = createRestrictedFetch(allowedHosts);
    const fetchRef = new ivm.Reference(
      async (urlStr: string, optionsJson: string) => restrictedFetchFn(urlStr, optionsJson),
    );
    await jail.set('_fetchHost', fetchRef);

    await ivmContext.eval(`
      async function fetch(url, options) {
        const optJson = options ? JSON.stringify(options) : '';
        const resultJson = await _fetchHost.apply(undefined, [url, optJson], { result: { promise: true } });
        return JSON.parse(resultJson);
      }
    `);

    // ---- Inject params and context ----
    await jail.set('_paramsJson', JSON.stringify(params));
    await jail.set('_contextJson', JSON.stringify(context));

    // ---- Compile and run the skill code ----
    // The skill source should export a `run` function:
    //   module.exports.run = async function(params, context) { ... }
    // We wrap it to capture the return value.
    const wrappedCode = `
      const module = { exports: {} };
      const exports = module.exports;

      ${sourceCode}

      (async () => {
        const params = JSON.parse(_paramsJson);
        const context = JSON.parse(_contextJson);

        if (typeof module.exports.run !== 'function') {
          throw new Error('Skill must export a run(params, context) function');
        }

        const result = await module.exports.run(params, context);
        return JSON.stringify(result === undefined ? null : result);
      })();
    `;

    const script = await isolate.compileScript(wrappedCode);
    const timeoutMs = skill.sandboxConfig.timeoutMs || 30000;

    const resultJson = await script.run(ivmContext, {
      timeout: timeoutMs,
      promise: true,
    });

    const durationMs = Date.now() - startTime;

    let data: unknown = null;
    if (typeof resultJson === 'string') {
      try {
        data = JSON.parse(resultJson);
      } catch {
        data = resultJson;
      }
    }

    return {
      success: true,
      data,
      logs: collectedLogs,
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Distinguish timeout from other errors
    const isTimeout = errorMessage.includes('Script execution timed out');

    logger.error(`Skill sandbox ${isTimeout ? 'timeout' : 'error'}`, {
      skillId: skill.id,
      skillName: skill.name,
      error: errorMessage,
      durationMs,
    });

    return {
      success: false,
      data: {
        error: isTimeout ? 'Skill execution timed out' : errorMessage,
        isTimeout,
      },
      logs: collectedLogs,
      durationMs,
    };
  } finally {
    // Always dispose the isolate to free memory
    if (isolate) {
      try {
        isolate.dispose();
      } catch {
        // Isolate may already be disposed if it hit the memory limit
      }
    }
  }
}
