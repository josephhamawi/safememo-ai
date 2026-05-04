/**
 * Noomachy Cloud Functions - Entry Point
 *
 * All Cloud Function exports are defined here.
 * Firebase automatically discovers and deploys exported functions.
 */

// Initialize Firebase Admin before anything else
import './init';

// Agent Functions
export { agentRouter } from './agents/router';
export { deleteAgent } from './agents/deleteAgent';

// Channel Webhooks
export { telegramWebhook } from './channels/telegram';
export { discordWebhook } from './channels/discord';
export { slackWebhook } from './channels/slack';

// MCP Server
export { mcpServer } from './mcp/server';

// Memory Functions — scheduled consolidation REMOVED (cost optimization 2026-05-03)
// Source preserved in memory/consolidation.ts. Was every 6h on Cloud Scheduler.

// Auto-pilot Goals — scheduled runner REMOVED (cost optimization 2026-05-03)
// Source preserved in goals/runner.ts. Was every 1 minute — primary cost driver.
// To revive, trigger via cron-job.org against an onRequest endpoint, never re-add onSchedule.

// Seed
export { seedSkills } from './seedSkills';

// Firestore Triggers
export {
  onStagingMemoryCreated,
  onMemoryApproved,
} from './triggers';
// force deploy 1775764567
