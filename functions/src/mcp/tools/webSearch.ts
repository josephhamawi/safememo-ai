import '../../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';
import CryptoJS from 'crypto-js';
import type { MCPToolResult } from '../../types';

const db = admin.firestore();
const SERPER_API_KEY = defineSecret('SERPER_API_KEY');

const CACHE_COLLECTION = 'cache/webSearch/queries';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 searches per minute per user

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const searchSchema = z.object({
  query: z.string().min(1).max(500),
  numResults: z.number().int().min(1).max(20).default(5),
  userId: z.string().min(1),
});

export const fetchUrlSchema = z.object({
  url: z.string().url(),
  userId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function queryHash(query: string, numResults: number): string {
  return CryptoJS.SHA256(`${query}::${numResults}`).toString();
}

/**
 * Check and enforce per-user rate limiting using Firestore counters.
 * Returns true if the request should be allowed.
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const rateLimitRef = db.collection('rateLimits/webSearch/users').doc(userId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(rateLimitRef);
    const data = doc.data() as
      | { timestamps: number[] }
      | undefined;

    let timestamps = data?.timestamps ?? [];
    // Remove entries outside the window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= RATE_LIMIT_MAX) {
      return false;
    }

    timestamps.push(now);
    tx.set(rateLimitRef, { timestamps }, { merge: true });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * Search the web using the Serper.dev API. Results are cached in Firestore.
 */
export async function search(
  query: string,
  numResults: number,
  userId: string,
): Promise<MCPToolResult> {
  try {
    // Rate limit check
    const allowed = await checkRateLimit(userId);
    if (!allowed) {
      return err('Rate limit exceeded: maximum 10 searches per minute');
    }

    // Check cache
    const hash = queryHash(query, numResults);
    const cacheRef = db.collection(CACHE_COLLECTION).doc(hash);
    const cached = await cacheRef.get();

    if (cached.exists) {
      const data = cached.data();
      if (data && Date.now() - data.cachedAt < CACHE_TTL_MS) {
        logger.info('webSearch cache hit', { query, hash });
        return ok(JSON.stringify(data.results, null, 2));
      }
    }

    // Call Serper.dev API
    const apiKey = SERPER_API_KEY.value();
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: numResults }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('Serper API error', {
        status: response.status,
        body,
      });
      return err(`Search API returned ${response.status}: ${body}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const results = ((json.organic ?? []) as Record<string, unknown>[]).map(
      (item: Record<string, unknown>) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        position: item.position,
      }),
    );

    // Write to cache
    await cacheRef.set({
      query,
      numResults,
      results,
      cachedAt: Date.now(),
    });

    return ok(JSON.stringify(results, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('search failed', { query, error: message });
    return err(`Search failed: ${message}`);
  }
}

/**
 * Fetch a URL and extract its text content.
 */
export async function fetchUrl(
  url: string,
  userId: string,
): Promise<MCPToolResult> {
  try {
    // Rate limit check (shares the same limit pool)
    const allowed = await checkRateLimit(userId);
    if (!allowed) {
      return err('Rate limit exceeded: maximum 10 requests per minute');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NoomachyBot/1.0 (+https://noomachy.ai)',
        Accept: 'text/html, text/plain, application/json',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return err(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();

    // Basic text extraction: strip HTML tags for HTML content
    let text: string;
    if (contentType.includes('text/html')) {
      text = body
        // Remove script and style blocks
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      text = body;
    }

    // Truncate to a reasonable size
    const MAX_LENGTH = 50_000;
    if (text.length > MAX_LENGTH) {
      text = text.substring(0, MAX_LENGTH) + '\n\n[Content truncated]';
    }

    return ok(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('fetchUrl failed', { url, error: message });
    return err(`Failed to fetch URL: ${message}`);
  }
}

export { SERPER_API_KEY };
