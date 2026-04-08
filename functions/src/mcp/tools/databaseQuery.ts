import '../../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import type { MCPToolResult } from '../../types';

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Collections users are allowed to query (scoped to their own data). */
const ALLOWED_COLLECTIONS = new Set([
  'conversations',
  'memories',
  'episodes',
  'agents',
  'notifications',
  'files',
]);

/** Maximum documents per query. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/** Operators that map to Firestore where-filter operators. */
const ALLOWED_OPERATORS = new Set([
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'not-in',
  'array-contains',
  'array-contains-any',
]);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const whereClauseSchema = z.object({
  field: z.string().min(1),
  op: z.string().refine((v) => ALLOWED_OPERATORS.has(v), {
    message: `Operator must be one of: ${[...ALLOWED_OPERATORS].join(', ')}`,
  }),
  value: z.unknown(),
});

export const queryCollectionSchema = z.object({
  userId: z.string().min(1),
  collection: z.string().min(1),
  filters: z.array(whereClauseSchema).max(10).default([]),
  orderBy: z
    .object({
      field: z.string().min(1),
      direction: z.enum(['asc', 'desc']).default('asc'),
    })
    .optional(),
  startAfter: z.unknown().optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export type QueryCollectionParams = z.infer<typeof queryCollectionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/**
 * Resolve the Firestore collection path scoped to a user.
 * E.g. "conversations" -> "users/{userId}/conversations"
 */
function scopedCollectionPath(userId: string, collection: string): string {
  return `users/${userId}/${collection}`;
}

/**
 * Validate that the collection name is allowed and the path is safe.
 */
function validateCollectionAccess(collection: string): string | null {
  // Reject paths with slashes (no deep subcollection access)
  if (collection.includes('/')) {
    return 'Subcollection paths are not allowed. Use a top-level collection name.';
  }

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return (
      `Collection "${collection}" is not queryable. ` +
      `Allowed collections: ${[...ALLOWED_COLLECTIONS].join(', ')}`
    );
  }

  return null; // valid
}

// ---------------------------------------------------------------------------
// Tool implementation
// ---------------------------------------------------------------------------

/**
 * Execute a read-only Firestore query scoped to the user's own data.
 * Supports where clauses, ordering, and pagination.
 * All write operations are blocked by design.
 */
export async function queryCollection(
  userId: string,
  collection: string,
  filters: Array<{ field: string; op: string; value: unknown }> = [],
  orderBy?: { field: string; direction: 'asc' | 'desc' },
  startAfter?: unknown,
  limit: number = DEFAULT_LIMIT,
): Promise<MCPToolResult> {
  try {
    // Validate collection access
    const accessError = validateCollectionAccess(collection);
    if (accessError) {
      return err(accessError);
    }

    // Clamp limit
    const effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);

    // Build query
    const collectionPath = scopedCollectionPath(userId, collection);
    let query: admin.firestore.Query = db.collection(collectionPath);

    // Apply where clauses
    for (const filter of filters) {
      // Prevent querying across user boundaries via field values
      if (
        filter.field === 'userId' &&
        filter.op === '==' &&
        filter.value !== userId
      ) {
        return err('Cannot query data belonging to another user');
      }

      query = query.where(
        filter.field,
        filter.op as FirebaseFirestore.WhereFilterOp,
        filter.value,
      );
    }

    // Apply ordering
    if (orderBy) {
      query = query.orderBy(orderBy.field, orderBy.direction);
    }

    // Apply pagination cursor
    if (startAfter !== undefined && startAfter !== null) {
      query = query.startAfter(startAfter);
    }

    // Apply limit
    query = query.limit(effectiveLimit);

    // Execute query
    const snapshot = await query.get();

    const results = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const response = {
      collection,
      count: results.length,
      hasMore: results.length === effectiveLimit,
      results,
    };

    logger.info('queryCollection', {
      userId,
      collection,
      filterCount: filters.length,
      resultCount: results.length,
    });

    return ok(JSON.stringify(response, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('queryCollection failed', {
      userId,
      collection,
      error: message,
    });
    return err(`Query failed: ${message}`);
  }
}
