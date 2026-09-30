import express from 'express';
import helmet from 'helmet';

import { closePool, pool } from './db';
import { env, isProduction } from './env';
import { attachUser, requireSameOrigin } from './middleware/auth';
import { agentsRouter, conversationsRouter } from './routes/agents';
import { authRouter } from './routes/auth';
import { chatRouter } from './routes/chat';
import { credentialsRouter } from './routes/credentials';
import { auditRouter, memoriesRouter, validationRouter } from './routes/memories';
import {
  commandsRouter,
  earlyAccessRouter,
  notificationsRouter,
  profileRouter,
  usageRouter,
} from './routes/misc';

const app = express();

// Behind a reverse proxy in every realistic deployment; needed for req.ip and
// for Secure-cookie detection to be correct.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());

// Same-origin by default: the web app is expected to be proxied under the same
// host. A different origin must be named explicitly in APP_ORIGIN.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === env.APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// 1 MB is generous for JSON here and keeps a single request from pinning
// memory. Large uploads go through the file endpoints, not this parser.
app.use(express.json({ limit: '1mb' }));

app.use(requireSameOrigin(env.APP_ORIGIN));
app.use(attachUser);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded' });
  }
});

app.use('/auth', authRouter);
app.use('/credentials', credentialsRouter);
app.use('/chat', chatRouter);
app.use('/agents', agentsRouter);
app.use('/conversations', conversationsRouter);
app.use('/memories', memoriesRouter);
app.use('/validation', validationRouter);
app.use('/audit', auditRouter);
app.use('/notifications', notificationsRouter);
app.use('/commands', commandsRouter);
app.use('/profile', profileRouter);
app.use('/usage', usageRouter);
app.use('/early-access', earlyAccessRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler. Details go to the log; the client gets a generic message so
// stack traces and driver errors never reach a browser.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[error]', err);
    if (res.headersSent) return;
    res.status(500).json({
      error: isProduction ? 'Internal server error' : String(err),
    });
  },
);

const server = app.listen(env.PORT, () => {
  console.log(`[server] listening on :${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
  // Force exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app };
