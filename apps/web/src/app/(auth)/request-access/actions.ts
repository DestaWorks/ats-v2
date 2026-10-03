"use server";

import { accessRequestSchema } from "@destaworks/contracts/validation/auth";
import { logger } from "@destaworks/config/logger";
import { headers } from "next/headers";
import { readFailure } from "@/lib/api/client";
import { apiUrl } from "@/lib/api/server";

/**
 * Server Action: submit an access request. Thin — validates with the shared Zod schema, then hands
 * the submission to `POST /access-requests` (Phase 4.0 Option A: `apps/web` never reaches the
 * services in-process).
 *
 * It posts directly rather than through `apiPost` because this caller is UNAUTHENTICATED: there is
 * no session to forward, and what does have to travel is the host the visitor opened the form on —
 * the API resolves and verifies the workspace from it, and refuses an unknown or suspended one.
 * Rate limiting moved with the endpoint (`RateLimitGuard`, same bucket, limit and window).
 */
export async function submitAccessRequest(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = accessRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }

  const url = apiUrl("/access-requests", process.env.API_URL);
  if (url === null) {
    logger.error("request_access.misconfigured", { reason: "API_URL is not set" });
    return {
      ok: false,
      error: "We couldn't submit your request just now. Please try again in a moment.",
    };
  }

  const host = (await headers()).get("host");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(host !== null && { "x-forwarded-host": host }),
      },
      body: JSON.stringify(parsed.data),
    });
  } catch {
    logger.error("request_access.unreachable", { url });
    return {
      ok: false,
      error: "We couldn't submit your request just now. Please try again in a moment.",
    };
  }

  if (res.ok) return { ok: true };

  const failure = await readFailure(res);
  if (failure.code === "RATE_LIMITED") {
    return { ok: false, error: "Too many requests. Please wait a moment and try again." };
  }
  if (failure.code === "CONFLICT") return { ok: false, error: failure.message };
  // Anything else is ours to fix, not the visitor's: the form is public and unauthenticated, so it
  // gets one neutral sentence while the real code and status go to the log.
  logger.error("request_access.rejected", { status: res.status, code: failure.code });
  return {
    ok: false,
    error: "We couldn't submit your request just now. Please try again in a moment.",
  };
}
