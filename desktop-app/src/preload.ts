import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script that bridges the MCP server availability to the web app
 * loaded in the Electron BrowserWindow.
 *
 * The web app at noomachy.com can use window.noomachy to:
 * - Check if the desktop app is wrapping it
 * - Get the MCP server URL
 * - Check MCP server health
 * - Listen for status changes
 */

interface McpHealthResponse {
  status: string;
  name: string;
  version: string;
}

const MCP_PORT = 3939;
const MCP_BASE_URL = `http://localhost:${MCP_PORT}`;

contextBridge.exposeInMainWorld('noomachy', {
  /** Indicates the web app is running inside the SafeMemo AI desktop wrapper */
  isDesktopApp: true,

  /** The MCP server base URL */
  mcpUrl: MCP_BASE_URL,

  /** The MCP server port */
  mcpPort: MCP_PORT,

  /** Platform info */
  platform: process.platform,

  /** App version */
  version: '1.0.0',

  /**
   * Check if the MCP server is reachable.
   * Returns the health response or null if unreachable.
   */
  checkMcpHealth: async (): Promise<McpHealthResponse | null> => {
    try {
      const response = await fetch(`${MCP_BASE_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        return (await response.json()) as McpHealthResponse;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * List available MCP tools
   */
  listTools: async (): Promise<unknown> => {
    try {
      const response = await fetch(`${MCP_BASE_URL}/tools/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Execute an MCP tool
   */
  callTool: async (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    try {
      const response = await fetch(`${MCP_BASE_URL}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, arguments: args }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Subscribe to MCP status changes from the main process
   */
  onMcpStatusChange: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on('mcp-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('mcp-status-changed', handler);
    };
  },

  /**
   * Request the main process to restart the MCP server
   */
  restartMcpServer: (): void => {
    ipcRenderer.send('mcp-restart');
  },

  /**
   * Get current MCP status from main process
   */
  getMcpStatus: (): Promise<string> => {
    return ipcRenderer.invoke('mcp-get-status');
  },

  /**
   * Get the public Cloudflare tunnel URL exposing the MCP server.
   * The web app can register this URL as a Custom MCP for cloud function access.
   */
  getTunnelUrl: (): Promise<string | null> => {
    return ipcRenderer.invoke('tunnel-get-url');
  },

  /**
   * Subscribe to tunnel ready events
   */
  onTunnelReady: (callback: (url: string) => void): (() => void) => {
    const handler = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('tunnel-ready', handler);
    return () => {
      ipcRenderer.removeListener('tunnel-ready', handler);
    };
  },
});

// Inject a small script that sets a CSS variable so the web app can detect desktop mode
window.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --noomachy-desktop: 1;
    }
  `;
  document.head.appendChild(style);
});
