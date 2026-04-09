import './init';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

const DEFAULT_SKILLS = [
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web and fetch page content. Find information, articles, documentation, and answers from across the internet.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 5.0,
    permissions: ['network'],
    sandboxConfig: { memoryLimitMB: 128, timeoutMs: 30000, allowedHosts: ['*'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/web_search', hash: 'builtin' },
    category: 'search',
    tags: ['search', 'web', 'browse', 'fetch', 'internet'],
    installCount: 142,
  },
  {
    id: 'file_operations',
    name: 'File Operations',
    description: 'Read, write, list, and delete files in your cloud storage. Manage documents, notes, and data files.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 5.0,
    permissions: ['filesystem'],
    sandboxConfig: { memoryLimitMB: 64, timeoutMs: 15000, allowedHosts: [] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/file_operations', hash: 'builtin' },
    category: 'storage',
    tags: ['files', 'storage', 'read', 'write', 'documents'],
    installCount: 198,
  },
  {
    id: 'code_execution',
    name: 'Code Execution',
    description: 'Execute JavaScript and Python code in a secure sandbox. Run calculations, data processing, and scripts.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 4.5,
    permissions: ['exec'],
    sandboxConfig: { memoryLimitMB: 256, timeoutMs: 60000, allowedHosts: [] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/code_execution', hash: 'builtin' },
    category: 'development',
    tags: ['code', 'javascript', 'python', 'execute', 'sandbox', 'compute'],
    installCount: 167,
  },
  {
    id: 'database_query',
    name: 'Database Query',
    description: 'Query your Firestore data with filters, sorting, and pagination. Access conversations, memories, and agent data.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 4.8,
    permissions: ['db'],
    sandboxConfig: { memoryLimitMB: 64, timeoutMs: 15000, allowedHosts: [] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/database_query', hash: 'builtin' },
    category: 'data',
    tags: ['database', 'firestore', 'query', 'data', 'analytics'],
    installCount: 89,
  },
  {
    id: 'text_analysis',
    name: 'Text Analysis',
    description: 'Analyze text for sentiment, entities, key phrases, and language detection. Summarize long documents.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 4.9,
    permissions: ['network'],
    sandboxConfig: { memoryLimitMB: 128, timeoutMs: 30000, allowedHosts: ['*'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/text_analysis', hash: 'builtin' },
    category: 'ai',
    tags: ['nlp', 'sentiment', 'summarize', 'entities', 'analysis', 'text'],
    installCount: 234,
  },
  {
    id: 'calculator',
    name: 'Calculator & Math',
    description: 'Perform mathematical calculations, unit conversions, date/time math, and statistical operations.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 5.0,
    permissions: ['exec'],
    sandboxConfig: { memoryLimitMB: 64, timeoutMs: 10000, allowedHosts: [] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/calculator', hash: 'builtin' },
    category: 'utilities',
    tags: ['math', 'calculator', 'convert', 'statistics', 'numbers'],
    installCount: 312,
  },
  {
    id: 'json_tools',
    name: 'JSON & Data Tools',
    description: 'Parse, transform, validate, and format JSON data. Convert between CSV, JSON, and other formats.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 5.0,
    permissions: ['exec'],
    sandboxConfig: { memoryLimitMB: 128, timeoutMs: 15000, allowedHosts: [] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/json_tools', hash: 'builtin' },
    category: 'development',
    tags: ['json', 'csv', 'data', 'transform', 'parse', 'format'],
    installCount: 156,
  },
  {
    id: 'gmail_integration',
    name: 'Gmail',
    description: 'Read, search, and send emails through Gmail. Requires Google OAuth connection in settings.',
    version: '0.9.0',
    author: 'Noomachy',
    trustScore: 4.7,
    permissions: ['network'],
    sandboxConfig: { memoryLimitMB: 128, timeoutMs: 30000, allowedHosts: ['gmail.googleapis.com'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/gmail', hash: 'builtin' },
    category: 'productivity',
    tags: ['email', 'gmail', 'google', 'send', 'inbox', 'communication'],
    installCount: 78,
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Create, read, update, and delete calendar events. Check availability and schedule meetings.',
    version: '0.9.0',
    author: 'Noomachy',
    trustScore: 4.7,
    permissions: ['network'],
    sandboxConfig: { memoryLimitMB: 128, timeoutMs: 30000, allowedHosts: ['calendar.googleapis.com'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/google_calendar', hash: 'builtin' },
    category: 'productivity',
    tags: ['calendar', 'events', 'schedule', 'google', 'meetings', 'time'],
    installCount: 65,
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Get current weather conditions and forecasts for any location worldwide.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 5.0,
    permissions: ['network'],
    sandboxConfig: { memoryLimitMB: 64, timeoutMs: 15000, allowedHosts: ['api.openweathermap.org'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/weather', hash: 'builtin' },
    category: 'utilities',
    tags: ['weather', 'forecast', 'temperature', 'climate'],
    installCount: 203,
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia Search',
    description: 'Search and retrieve Wikipedia articles. Get summaries, full content, and related topics.',
    version: '1.0.0',
    author: 'Noomachy',
    trustScore: 5.0,
    permissions: ['network'],
    sandboxConfig: { memoryLimitMB: 128, timeoutMs: 20000, allowedHosts: ['en.wikipedia.org'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/wikipedia', hash: 'builtin' },
    category: 'search',
    tags: ['wikipedia', 'encyclopedia', 'knowledge', 'research', 'articles'],
    installCount: 145,
  },
  {
    id: 'image_generation',
    name: 'Image Generation',
    description: 'Generate images from text descriptions using AI. Create illustrations, diagrams, and visuals.',
    version: '0.8.0',
    author: 'Noomachy',
    trustScore: 4.2,
    permissions: ['network', 'exec'],
    sandboxConfig: { memoryLimitMB: 512, timeoutMs: 60000, allowedHosts: ['*'] },
    mcpEndpoint: '',
    implementation: { storagePath: 'builtin/image_gen', hash: 'builtin' },
    category: 'ai',
    tags: ['image', 'generate', 'art', 'visual', 'dall-e', 'ai'],
    installCount: 56,
  },
];

export const seedSkills = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }

    try {
      const batch = db.batch();
      const now = Timestamp.now();

      for (const skill of DEFAULT_SKILLS) {
        const ref = db.collection('skills').doc(skill.id);
        batch.set(ref, {
          ...skill,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      await batch.commit();
      logger.info(`Seeded ${DEFAULT_SKILLS.length} skills`);
      res.json({ success: true, count: DEFAULT_SKILLS.length });
    } catch (err) {
      logger.error('Failed to seed skills:', err);
      res.status(500).json({ error: 'Failed to seed skills' });
    }
  }
);
