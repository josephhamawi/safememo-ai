import '../../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import type { MCPToolResult } from '../../types';

const storage = admin.storage();
const BUCKET = storage.bucket();
const USER_PREFIX = 'users';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const listFilesSchema = z.object({
  userId: z.string().min(1),
  path: z.string().default(''),
});

export const readFileSchema = z.object({
  userId: z.string().min(1),
  path: z.string().min(1),
});

export const writeFileSchema = z.object({
  userId: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
});

export const deleteFileSchema = z.object({
  userId: z.string().min(1),
  path: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build and validate a storage path scoped to the given user.
 * Prevents path-traversal attacks by rejecting `..` segments.
 */
function scopedPath(userId: string, relativePath: string): string {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.some((s) => s === '..')) {
    throw new Error('Path traversal is not allowed');
  }
  return [USER_PREFIX, userId, ...segments].join('/');
}

function ok(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }] };
}

function err(text: string): MCPToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/**
 * List files in a user's Cloud Storage folder.
 */
export async function listFiles(
  userId: string,
  path: string,
): Promise<MCPToolResult> {
  try {
    const prefix = scopedPath(userId, path);
    const [files] = await BUCKET.getFiles({
      prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
      autoPaginate: true,
    });

    const entries = files.map((f) => {
      const relative = f.name.replace(`${USER_PREFIX}/${userId}/`, '');
      return {
        name: relative,
        size: f.metadata.size ?? 0,
        updated: f.metadata.updated ?? '',
      };
    });

    return ok(JSON.stringify(entries, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('listFiles failed', { userId, path, error: message });
    return err(`Failed to list files: ${message}`);
  }
}

/**
 * Read text file content from a user's Cloud Storage folder.
 */
export async function readFile(
  userId: string,
  path: string,
): Promise<MCPToolResult> {
  try {
    const filePath = scopedPath(userId, path);
    const file = BUCKET.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return err(`File not found: ${path}`);
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB limit for text reads
    if (size > MAX_SIZE) {
      return err(
        `File too large to read as text (${size} bytes, max ${MAX_SIZE})`,
      );
    }

    const [contents] = await file.download();
    return ok(contents.toString('utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('readFile failed', { userId, path, error: message });
    return err(`Failed to read file: ${message}`);
  }
}

/**
 * Write content to a file in a user's Cloud Storage folder.
 */
export async function writeFile(
  userId: string,
  path: string,
  content: string,
): Promise<MCPToolResult> {
  try {
    const filePath = scopedPath(userId, path);
    const file = BUCKET.file(filePath);

    await file.save(Buffer.from(content, 'utf-8'), {
      contentType: 'text/plain; charset=utf-8',
      resumable: false,
    });

    return ok(`File written successfully: ${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('writeFile failed', { userId, path, error: message });
    return err(`Failed to write file: ${message}`);
  }
}

/**
 * Delete a file from a user's Cloud Storage folder.
 */
export async function deleteFile(
  userId: string,
  path: string,
): Promise<MCPToolResult> {
  try {
    const filePath = scopedPath(userId, path);
    const file = BUCKET.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return err(`File not found: ${path}`);
    }

    await file.delete();
    return ok(`File deleted successfully: ${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('deleteFile failed', { userId, path, error: message });
    return err(`Failed to delete file: ${message}`);
  }
}
