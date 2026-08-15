import { NextResponse } from "next/server";
import { PORTAL_TOKEN_COOKIE } from "@/lib/constants";
import { exchangePortalToken } from "@/server/auth/portal-guards";
import { checkRateLimit } from "@/server/http/rate-limit";
import { AppError } from "@/server/http/app-error";

/**
 * GET /portal/access?token=... — the one-time link exchange. Validates the token, sets an
 * HttpOnly/Secure/SameSite=Lax cookie with `Max-Age` matching the token's REAL remaining
 * lifetime, then redirects to a clean `/portal` URL (the token never appears in the address bar
 * again after this one request). Invalid/expired/revoked → redirect to the request-access page
 * with an explanatory message.
 *
 * Cookie `path` is `/` (not `/portal`) — the write route lives at `/api/portal/roles`, which
 * doesn't share the `/portal` prefix, so a narrower path would silently fail to attach there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");

  try {
    await checkRateLimit("portal-access", { limit: 20, windowMs: 60_000 });
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") {
      return NextResponse.redirect(
        new URL("/portal/request-access?error=rate_limited", url.origin),
      );
    }
    throw err;
  }

  const result = rawToken ? await exchangePortalToken(rawToken) : null;
  if (!result) {
    return NextResponse.redirect(new URL("/portal/request-access?error=invalid_link", url.origin));
  }

  const response = NextResponse.redirect(new URL("/portal", url.origin));
  const maxAgeSeconds = Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(PORTAL_TOKEN_COOKIE, rawToken!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}
