import { parse as parseCookie } from 'cookie';
import type { NextFunction, Request, Response } from 'express';

import { SESSION_COOKIE, type SessionUser, resolveSession } from '../lib/session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[SESSION_COOKIE];
}

/** Attaches req.user when a valid session cookie is present. Never rejects. */
export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readSessionToken(req);
    if (token) {
      const user = await resolveSession(token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    }
  } catch (err) {
    console.error('[auth] session lookup failed', err);
  }
  next();
}

/** Rejects the request unless a valid session is attached. */
export function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign-in required' });
    return;
  }
  next();
}

/**
 * Cross-origin write protection.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site form
 * posts, but a same-site subdomain or a misconfigured proxy can defeat that.
 * Requiring Origin to match APP_ORIGIN on every state-changing request is the
 * cheap second check.
 */
export function requireSameOrigin(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== allowedOrigin) {
      res.status(403).json({ error: 'Cross-origin request rejected' });
      return;
    }
    next();
  };
}
