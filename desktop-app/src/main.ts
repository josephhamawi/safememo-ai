import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  session,
  Menu,
} from 'electron';
import * as path from 'path';
import { McpManager } from './mcp-manager';
import { TrayManager } from './tray';
import { TunnelManager } from './tunnel';

// ─────────────────────────────────────────────
// Singleton lock - only one instance allowed
// ─────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ─────────────────────────────────────────────
// Globals
// ─────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
const mcpManager = new McpManager();
const tunnelManager = new TunnelManager(3939);
const trayManager = new TrayManager(mcpManager);

const WEB_APP_URL = 'https://noomachy.web.app';
const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;

// ─────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 900,
    minHeight: 600,
    title: 'Noomachy',
    icon: path.join(__dirname, '..', 'assets', 'icon.icns'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Dark title bar appearance
  mainWindow.setBackgroundColor('#000000');

  // Load the hosted web app
  mainWindow.loadURL(WEB_APP_URL);

  // Show window when ready to avoid flash of white
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      trayManager.updateMenu();
    }
  });

  mainWindow.on('show', () => {
    trayManager.updateMenu();
  });

  mainWindow.on('hide', () => {
    trayManager.updateMenu();
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const { shell } = require('electron');
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Pass mainWindow to tray so it can toggle visibility
  trayManager.setMainWindow(mainWindow);
}

// ─────────────────────────────────────────────
// App menu (macOS)
// ─────────────────────────────────────────────
function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Noomachy',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit Noomachy',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────
function setupIPC(): void {
  // Forward MCP status changes to renderer
  mcpManager.on('status-changed', (status: string) => {
    mainWindow?.webContents.send('mcp-status-changed', status);
  });

  // Handle restart request from renderer
  ipcMain.on('mcp-restart', () => {
    mcpManager.restart();
  });

  // Handle status query from renderer
  ipcMain.handle('mcp-get-status', () => {
    return mcpManager.status;
  });

  // Get tunnel public URL (for auto-registration)
  ipcMain.handle('tunnel-get-url', () => {
    return tunnelManager.publicUrl;
  });
}

// ─────────────────────────────────────────────
// CSP - allow the web app to talk to localhost MCP
// ─────────────────────────────────────────────
function setupCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };

    // Remove restrictive CSP that would block localhost requests
    // The web app needs to reach localhost:3939 for the MCP server
    delete headers['content-security-policy'];
    delete headers['Content-Security-Policy'];

    callback({ responseHeaders: headers });
  });
}

// ─────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────

// Track quitting state outside the App type
let isQuitting = false;

app.whenReady().then(async () => {
  // Set Dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    const { nativeImage } = require('electron');
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    try { app.dock.setIcon(nativeImage.createFromPath(iconPath)); } catch {}
  }

  setupCSP();
  createAppMenu();
  createWindow();
  setupIPC();
  trayManager.create();

  // Start MCP server
  console.log('[Noomachy] Starting MCP server...');
  await mcpManager.start();

  // Start Cloudflare tunnel to expose MCP publicly
  console.log('[Noomachy] Starting tunnel...');
  const publicUrl = await tunnelManager.start();
  if (publicUrl) {
    console.log(`[Noomachy] MCP exposed at: ${publicUrl}`);
    // Notify renderer when ready
    mainWindow?.webContents.send('tunnel-ready', publicUrl);
  }

  // Global shortcut to show/hide
  globalShortcut.register('CmdOrCtrl+Shift+N', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

// macOS: re-create window when dock icon is clicked
app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// Second instance: show the existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Before quit: clean up MCP server
app.on('before-quit', async () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  console.log('[Noomachy] Shutting down MCP server...');
  tunnelManager.stop();
  await mcpManager.stop();
  trayManager.destroy();
});

// Quit when all windows are closed (non-macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
