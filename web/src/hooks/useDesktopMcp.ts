'use client';

interface SafeMemoDesktop {
  isDesktopApp: boolean;
  getTunnelUrl: () => Promise<string | null>;
  onTunnelReady: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    // Preload bridge key, set by the Electron wrapper. Unchanged during the
    // rename so an older desktop build still matches.
    noomachy?: SafeMemoDesktop;
  }
}

/**
 * Auto-registration of the local desktop MCP server.
 *
 * Intentionally a no-op right now. The Firebase version wrote a Custom MCP
 * document to `users/{uid}/customMcps`; the self-hosted backend has no custom
 * MCP registry yet — only the built-in memory tools were ported — so there is
 * nothing to register against. The hook and the window bridge are kept so the
 * desktop integration point stays visible rather than being silently dropped.
 */
export function useDesktopMcp(): void {
  // Restore once the server exposes custom MCP endpoints.
}
