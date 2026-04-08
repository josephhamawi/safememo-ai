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

// Channel Webhooks
export { telegramWebhook } from './channels/telegram';
export { discordWebhook } from './channels/discord';
export { slackWebhook } from './channels/slack';

// MCP Server
export { mcpServer } from './mcp/server';

// Memory Functions
export { consolidateEpisodes } from './memory/consolidation';

// Firestore Triggers
export {
  onStagingMemoryCreated,
  onMemoryApproved,
} from './triggers';
