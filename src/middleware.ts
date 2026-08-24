import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Fast, DB-free redirect when there's no session cookie at all. Not authoritative —
 *  `layout.tsx`'s `getCurrentUser()` still does the real check on every request that gets past this. */
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

/** Denylist, not an allowlist — protects every route except the public `(auth)` pages, the
 *  client `/portal/**` (its own token cookie, not a staff session), `/api/**`, and static assets. */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sign-in|forgot-password|reset-password|request-access|portal).*)",
  ],
};
