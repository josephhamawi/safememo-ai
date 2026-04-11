import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

/**
 * Manages a Cloudflare Quick Tunnel that exposes a local port to the internet.
 * No account required — uses trycloudflare.com.
 *
 * Uses the cloudflared binary bundled via the `cloudflared` npm package.
 */
export class TunnelManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private _publicUrl: string | null = null;
  private _port: number;

  constructor(port: number) {
    super();
    this._port = port;
  }

  get publicUrl(): string | null {
    return this._publicUrl;
  }

  /**
   * Resolve the path to the bundled cloudflared binary.
   * In dev: node_modules/cloudflared/bin/cloudflared
   * In packaged app: extraResources/cloudflared/cloudflared
   */
  private getBinaryPath(): string | null {
    const candidates: string[] = [];

    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, 'cloudflared', 'cloudflared'));
    }

    // Dev: node_modules in desktop-app
    candidates.push(
      path.join(__dirname, '..', 'node_modules', 'cloudflared', 'bin', 'cloudflared'),
    );

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  async start(): Promise<string | null> {
    const bin = this.getBinaryPath();
    if (!bin) {
      console.warn('[Tunnel] cloudflared binary not found');
      this.emit('error', 'cloudflared binary not found');
      return null;
    }

    if (this.process) {
      return this._publicUrl;
    }

    console.log(`[Tunnel] Starting Cloudflare quick tunnel for localhost:${this._port}`);

    return new Promise((resolve) => {
      this.process = spawn(bin, [
        'tunnel',
        '--url',
        `http://localhost:${this._port}`,
        '--no-autoupdate',
      ]);

      let resolved = false;

      const onData = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          this._publicUrl = match[0];
          console.log(`[Tunnel] Public URL: ${this._publicUrl}`);
          this.emit('ready', this._publicUrl);
          resolved = true;
          resolve(this._publicUrl);
        }
      };

      this.process.stdout?.on('data', onData);
      this.process.stderr?.on('data', onData);

      this.process.on('exit', (code) => {
        console.log(`[Tunnel] Process exited with code ${code}`);
        this.process = null;
        this._publicUrl = null;
        this.emit('stopped');
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      this.process.on('error', (err) => {
        console.error('[Tunnel] Process error:', err);
        this.emit('error', err);
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      });

      // Timeout after 30s (cloudflared can be slow to negotiate)
      setTimeout(() => {
        if (!resolved) {
          console.error('[Tunnel] Timeout waiting for public URL');
          resolved = true;
          resolve(null);
        }
      }, 30000);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this._publicUrl = null;
    }
  }
}
