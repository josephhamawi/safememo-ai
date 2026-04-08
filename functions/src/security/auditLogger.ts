import * as crypto from 'crypto';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { v4 as uuidv4 } from 'uuid';
import { AuditLog } from '../types';

// ============================================================
// Constants
// ============================================================

const AUDIT_COLLECTION = 'auditLogs';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// ============================================================
// Integrity hashing
// ============================================================

/**
 * Compute a SHA-256 hex digest of the given data for tamper-detection.
 * Deterministic: keys are sorted before hashing.
 */
function computeHash(data: Record<string, unknown>): string {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Build the integrity hash for an audit entry.
 * Combines params + result (if present) into a single hash.
 */
function buildResultHash(
  params?: Record<string, unknown>,
  result?: unknown,
): string {
  const payload: Record<string, unknown> = {};
  if (params) payload.params = params;
  if (result !== undefined) payload.result = result;
  return computeHash(payload);
}

// ============================================================
// Core write
// ============================================================

const db = () => getFirestore();

/**
 * Write a single audit log entry to Firestore.
 *
 * @param entry - Partial AuditLog; `id`, `timestamp`, and `resultHash` are
 *                auto-populated if not provided.
 * @returns The generated document ID.
 */
export async function logAction(
  entry: Partial<AuditLog> & { userId: string; action: string },
): Promise<string> {
  try {
    const id = entry.id ?? uuidv4();

    // Build integrity hash from params + any result-like data
    const resultHash =
      entry.resultHash ?? buildResultHash(entry.params);

    const doc: Record<string, unknown> = {
      ...entry,
      id,
      resultHash,
      status: entry.status ?? 'success',
      duration: entry.duration ?? 0,
      timestamp: FieldValue.serverTimestamp(),
    };

    await db().collection(AUDIT_COLLECTION).doc(id).set(doc);

    logger.info('Audit log written', { id, action: entry.action, userId: entry.userId });
    return id;
  } catch (err) {
    logger.error('Failed to write audit log', { error: err, entry });
    throw err;
  }
}

// ============================================================
// Specialized loggers
// ============================================================

/**
 * Log a tool / skill execution with full parameter + result audit trail.
 */
export async function logToolExecution(
  userId: string,
  agentId: string,
  skillId: string,
  params: Record<string, unknown>,
  result: unknown,
  duration: number,
): Promise<string> {
  const status = isErrorResult(result) ? 'error' : 'success';

  return logAction({
    userId,
    agentId,
    action: 'tool_execution',
    skillId,
    params,
    resultHash: buildResultHash(params, result),
    status,
    duration,
  });
}

/**
 * Log a memory operation (create, update, delete, promote, approve, reject).
 */
export async function logMemoryAction(
  userId: string,
  agentId: string,
  action: string,
  memoryId: string,
): Promise<string> {
  return logAction({
    userId,
    agentId,
    action: `memory_${action}`,
    params: { memoryId },
    status: 'success',
    duration: 0,
  });
}

// ============================================================
// Query
// ============================================================

export interface AuditQueryFilters {
  agentId?: string;
  action?: string;
  skillId?: string;
  status?: 'success' | 'error';
  startDate?: Timestamp;
  endDate?: Timestamp;
  pageSize?: number;
  startAfterDocId?: string;
}

export interface AuditQueryResult {
  entries: AuditLog[];
  lastDocId: string | null;
  hasMore: boolean;
}

/**
 * Read audit log entries with filtering and cursor-based pagination.
 *
 * Entries are always scoped to a single userId (enforced) and ordered
 * by timestamp descending.
 */
export async function queryAuditLog(
  userId: string,
  filters: AuditQueryFilters = {},
): Promise<AuditQueryResult> {
  try {
    const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    let query = db()
      .collection(AUDIT_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc');

    if (filters.agentId) {
      query = query.where('agentId', '==', filters.agentId);
    }
    if (filters.action) {
      query = query.where('action', '==', filters.action);
    }
    if (filters.skillId) {
      query = query.where('skillId', '==', filters.skillId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.startDate) {
      query = query.where('timestamp', '>=', filters.startDate);
    }
    if (filters.endDate) {
      query = query.where('timestamp', '<=', filters.endDate);
    }

    // Cursor-based pagination
    if (filters.startAfterDocId) {
      const cursorDoc = await db()
        .collection(AUDIT_COLLECTION)
        .doc(filters.startAfterDocId)
        .get();

      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Fetch one extra to determine hasMore
    const snap = await query.limit(pageSize + 1).get();

    const hasMore = snap.docs.length > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    const entries = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLog[];

    const lastDocId = docs.length > 0 ? docs[docs.length - 1].id : null;

    return { entries, lastDocId, hasMore };
  } catch (err) {
    logger.error('Failed to query audit log', { error: err, userId, filters });
    throw err;
  }
}

// ============================================================
// Utilities
// ============================================================

/**
 * Heuristic check for whether a result represents an error.
 */
function isErrorResult(result: unknown): boolean {
  if (result === null || result === undefined) return false;
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    return r.isError === true || r.error !== undefined;
  }
  return false;
}
