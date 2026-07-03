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

// MCP Server
export { mcpServer } from './mcp/server';

// Audit share endpoint (signed-token, public) + token minting (auth'd)
export { auditShare } from './audit/share';
export { mintAuditShareToken } from './audit/mintToken';

// Memory decision callables (auth'd) — approve/reject/purge memories
export { decideMemory, purgeMemory } from './memory/decideCallable';

// Seed
export { seedSkills } from './seedSkills';

// Firestore Triggers
export {
  onStagingMemoryCreated,
  onMemoryApproved,
} from './triggers';
