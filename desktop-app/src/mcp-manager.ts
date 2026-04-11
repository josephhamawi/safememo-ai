import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as http from 'http';
import { app } from 'electron';
import { EventEmitter } from 'events';

export type McpStatus = 'stopped' | 'starting' | 'running' | 'error';

export class McpManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private _status: McpStatus = 'stopped';
  private _port: number = 3939;
  private restartAttempts: number = 0;
  private maxRestartAttempts: number = 5;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  get status(): McpStatus {
    return this._status;
  }

  get port(): number {
    return this._port;
  }

  private setStatus(status: McpStatus): void {
    this._status = status;
    this.emit('status-changed', status);
  }

  /**
   * Resolve the path to the MCP server entry point.
   * In development: use the sibling desktop-mcp/dist/server.js
   * In production (packaged): use the extraResources bundle
   */
  private getServerPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'mcp-server', 'dist', 'server.js');
    }
    return path.join(__dirname, '..', '..', 'desktop-mcp', 'dist', 'server.js');
  }

  private getServerCwd(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'mcp-server');
    }
    return path.join(__dirname, '..', '..', 'desktop-mcp');
  }

  async start(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') {
      console.log('[MCP] Server already running or starting');
      return;
    }

    this.setStatus('starting');

    // Kill any existing process on the port
    try {
      execSync(`lsof -ti:${this._port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    } catch { /* no process on port — fine */ }

    const serverPath = this.getServerPath();
    const serverCwd = this.getServerCwd();

    console.log(`[MCP] Starting server: node ${serverPath}`);
    console.log(`[MCP] Working directory: ${serverCwd}`);

    try {
      this.process = spawn('node', [serverPath], {
        cwd: serverCwd,
        env: {
          ...process.env,
          PORT: String(this._port),
          NODE_ENV: 'production',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[MCP stdout] ${msg}`);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[MCP stderr] ${msg}`);
      });

      this.process.on('error', (err: Error) => {
        console.error('[MCP] Process error:', err.message);
        this.setStatus('error');
        this.attemptRestart();
      });

      this.process.on('exit', (code: number | null, signal: string | null) => {
        console.log(`[MCP] Process exited with code ${code}, signal ${signal}`);
        this.process = null;
        if (this._status !== 'stopped') {
          this.setStatus('error');
          this.attemptRestart();
        }
      });

      // Wait for the server to become healthy
      await this.waitForHealthy(10000);
      this.restartAttempts = 0;
      this.setStatus('running');
      this.startHealthCheck();
      console.log(`[MCP] Server is running on port ${this._port}`);
    } catch (err) {
      console.error('[MCP] Failed to start server:', err);
      this.setStatus('error');
      this.kill();
      this.attemptRestart();
    }
  }

  async stop(): Promise<void> {
    this.setStatus('stopped');
    this.stopHealthCheck();
    this.kill();
  }

  private kill(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }
  }

  private async attemptRestart(): Promise<void> {
    if (this._status === 'stopped') return;
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`[MCP] Max restart attempts (${this.maxRestartAttempts}) reached`);
      this.setStatus('error');
      return;
    }

    this.restartAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.restartAttempts - 1), 15000);
    console.log(`[MCP] Restart attempt ${this.restartAttempts}/${this.maxRestartAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (this._status !== 'stopped') {
        this.start();
      }
    }, delay);
  }

  private waitForHealthy(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Health check timeout'));
          return;
        }

        this.checkHealth()
          .then((healthy) => {
            if (healthy) {
              resolve();
            } else {
              setTimeout(check, 500);
            }
          })
          .catch(() => {
            setTimeout(check, 500);
          });
      };

      // Give the process a moment to start before first check
      setTimeout(check, 300);
    });
  }

  private checkHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${this._port}/health`, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(async () => {
      if (this._status !== 'running') return;
      const healthy = await this.checkHealth();
      if (!healthy && this._status === 'running') {
        console.warn('[MCP] Health check failed');
        this.setStatus('error');
        this.kill();
        this.attemptRestart();
      }
    }, 30000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async restart(): Promise<void> {
    console.log('[MCP] Restarting server...');
    this.restartAttempts = 0;
    await this.stop();
    // Brief pause between stop and start
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.start();
  }
}
