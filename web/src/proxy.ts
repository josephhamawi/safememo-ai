import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Optimistic route gate.
 *
 * Next 16 renamed Middleware to Proxy; the file convention is `proxy.ts`
 * alongside `app/`. Per the Next docs this is explicitly *not* a session
 * management or authorization solution — it only checks that a session cookie
 * is present, to avoid flashing a protected page before the client discovers
 * it is signed out. Real authorization happens in the API, which validates
 * the session against the database on every request.
 *
 * The cookie is HttpOnly, so its value is opaque here. Presence is all that
 * can be checked, and a forged cookie gets no further than the first API call.
 */

const SESSION_COOKIE = 'safememo_session';

const PROTECTED_PREFIXES = ['/dashboard', '/onboarding'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const loginUrl = new URL('/auth/login', request.url);
  // Preserve where they were headed so the API-key step can hand them back.
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
};
