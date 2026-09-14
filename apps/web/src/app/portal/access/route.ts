import { NextResponse } from "next/server";
import { PORTAL_TOKEN_COOKIE } from "@destaworks/domain/constants";
import { exchangePortalToken } from "@destaworks/auth/portal-guards";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { AppError } from "@destaworks/integrations/http/app-error";

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
function rateLimitKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim();
  const address =
    firstHop !== undefined && firstHop !== ""
      ? firstHop
      : (req.headers.get("x-real-ip") ?? "anonymous");
  return `portal-access:ip:${address}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");

  try {
    await checkRateLimit(rateLimitKey(req), { limit: 20, windowMs: 60_000 });
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") {
      return NextResponse.redirect(
        new URL("/portal/request-access?error=rate_limited", url.origin),
      );
    }
    throw err;
  }

  const result = rawToken ? await exchangePortalToken(rawToken) : null;
  if (!rawToken || !result) {
    return NextResponse.redirect(new URL("/portal/request-access?error=invalid_link", url.origin));
  }

  const response = NextResponse.redirect(new URL("/portal", url.origin));
  const maxAgeSeconds = Math.max(0, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(PORTAL_TOKEN_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}
