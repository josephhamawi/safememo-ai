import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import * as path from 'path';
import { McpManager, McpStatus } from './mcp-manager';

export class TrayManager {
  private tray: Tray | null = null;
  private mcpManager: McpManager;
  private mainWindow: BrowserWindow | null = null;

  constructor(mcpManager: McpManager) {
    this.mcpManager = mcpManager;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  create(): void {
    const iconPath = this.getIconPath();
    const icon = nativeImage.createFromPath(iconPath);

    // Resize for tray (macOS expects 16x16 or 22x22 template images)
    const trayIcon = icon.resize({ width: 22, height: 22 });
    trayIcon.setTemplateImage(true);

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('SafeMemo AI');

    this.updateMenu();

    this.tray.on('click', () => {
      this.toggleWindow();
    });

    // Listen for MCP status changes
    this.mcpManager.on('status-changed', () => {
      this.updateMenu();
    });
  }

  private getIconPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, '..', 'assets', 'icon.png');
    }
    return path.join(__dirname, '..', 'assets', 'icon.png');
  }

  private getStatusLabel(status: McpStatus): string {
    switch (status) {
      case 'running': return 'MCP Server: Running (port 3939)';
      case 'starting': return 'MCP Server: Starting...';
      case 'stopped': return 'MCP Server: Stopped';
      case 'error': return 'MCP Server: Error';
    }
  }

  private getStatusIcon(status: McpStatus): string {
    switch (status) {
      case 'running': return '\u2705';  // green check
      case 'starting': return '\u23F3'; // hourglass
      case 'stopped': return '\u26D4';  // red circle
      case 'error': return '\u26A0\uFE0F';  // warning
    }
  }

  updateMenu(): void {
    if (!this.tray) return;

    const status = this.mcpManager.status;
    const statusLabel = `${this.getStatusIcon(status)} ${this.getStatusLabel(status)}`;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'SafeMemo AI',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: this.mainWindow?.isVisible() ? 'Hide Window' : 'Show Window',
        click: () => this.toggleWindow(),
        accelerator: 'CmdOrCtrl+Shift+N',
      },
      { type: 'separator' },
      {
        label: statusLabel,
        enabled: false,
      },
      {
        label: status === 'running' ? 'Restart MCP Server' : 'Start MCP Server',
        click: () => {
          if (status === 'running') {
            this.mcpManager.restart();
          } else {
            this.mcpManager.start();
          }
        },
      },
      {
        label: 'Stop MCP Server',
        enabled: status === 'running',
        click: () => {
          this.mcpManager.stop();
        },
      },
      { type: 'separator' },
      {
        label: 'Open Web App in Browser',
        click: () => {
          const { shell } = require('electron');
          shell.openExternal('https://noomachy.com');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit SafeMemo AI',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          // Force quit - don't just hide
          if (this.mainWindow) {
            this.mainWindow.destroy();
          }
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    // Update tooltip to reflect status
    this.tray.setToolTip(`SafeMemo AI - ${this.getStatusLabel(status)}`);
  }

  private toggleWindow(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
    this.updateMenu();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
