import express from 'express';
import cors from 'cors';
import { getAllTools, executeTool } from './registry';

const app = express();
const PORT = parseInt(process.env.PORT || '3939', 10);
const API_KEY = process.env.MCP_API_KEY || 'noomachy-local';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth middleware
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const auth = req.headers.authorization;
  if (auth && auth === `Bearer ${API_KEY}`) return next();
  // Allow no-auth for local development
  if (!process.env.MCP_API_KEY) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', name: 'noomachy-desktop-mcp', version: '1.0.0' });
});

// MCP: List available tools
app.post('/tools/list', (_req, res) => {
  const tools = getAllTools();
  res.json({ tools });
});

// MCP: Execute a tool
app.post('/tools/call', async (req, res) => {
  const { name, arguments: args } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Missing tool name' });
    return;
  }

  try {
    const result = await executeTool(name, args || {});
    res.json(result);
  } catch (err) {
    console.error(`Tool execution error [${name}]:`, err);
    res.json({
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    });
  }
});

// MCP: List resources
app.post('/resources/list', (_req, res) => {
  res.json({
    resources: [
      { uri: 'noomachy://local/mail', name: 'Apple Mail', description: 'Read emails from Mail.app' },
      { uri: 'noomachy://local/notes', name: 'Apple Notes', description: 'Read and write notes' },
      { uri: 'noomachy://local/calendar', name: 'Calendar', description: 'Read calendar events' },
      { uri: 'noomachy://local/reminders', name: 'Reminders', description: 'Read and create reminders' },
      { uri: 'noomachy://local/clipboard', name: 'Clipboard', description: 'Read/write system clipboard' },
      { uri: 'noomachy://local/files', name: 'Files', description: 'Read/write local files' },
      { uri: 'noomachy://local/browser', name: 'Browser', description: 'Open URLs in default browser' },
      { uri: 'noomachy://local/system', name: 'System', description: 'System info and notifications' },
    ],
  });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║       SafeMemo AI Desktop MCP Server v1.0.0         ║
║══════════════════════════════════════════════════║
║  Running on: http://localhost:${PORT}               ║
║  API Key:    ${process.env.MCP_API_KEY ? '****' + API_KEY.slice(-4) : 'none (open)'}                        ║
║                                                  ║
║  Register this URL in SafeMemo AI:                  ║
║  → Dashboard → Skills → Add Custom MCP           ║
║  → Endpoint: http://localhost:${PORT}               ║
╚══════════════════════════════════════════════════╝
  `);
});
