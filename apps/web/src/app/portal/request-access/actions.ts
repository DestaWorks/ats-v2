"use server";

import { headers } from "next/headers";
import { portalAccessRequestSchema } from "@destaworks/contracts/validation/portal";
import { AppError, isAppErrorCode } from "@destaworks/integrations/http/app-error";
import { readFailure } from "@/lib/api/client";
import { apiUrl } from "@/lib/api/server";

/**
 * Server Action: submit a Client Portal access request. Public (no auth) — mirrors
 * `(auth)/request-access/actions.ts`'s shape exactly, and posts to `POST /portal/access-requests`
 * for the same reasons: no session to forward, and the visitor's host is what tells the API which
 * workspace this is. Deliberately does NOT reuse `submitAccessRequest`/`AccessRequest` — this
 * grants a `ClientContact` a portal token, not one of the 6 internal RBAC roles.
 *
 * An unknown or suspended workspace comes back as `NOT_FOUND` and renders as the same generic form
 * error it did in-process, so the form never confirms which workspaces exist.
 */
export async function submitPortalAccessRequest(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = portalAccessRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }

  const url = apiUrl("/portal/access-requests", process.env.API_URL);
  if (url === null) {
    throw new AppError("INTERNAL", "The API address is not configured (API_URL).");
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
    throw new AppError("UPSTREAM_ERROR", "Couldn't reach the API.", 502);
  }

  if (res.ok) return { ok: true };

  const failure = await readFailure(res);
  if (failure.code === "RATE_LIMITED") {
    return { ok: false, error: "Too many requests. Please wait a moment and try again." };
  }
  if (failure.code === "NOT_FOUND" || failure.code === "BAD_REQUEST") {
    return { ok: false, error: "Please check the form and try again." };
  }
  throw new AppError(
    isAppErrorCode(failure.code) ? failure.code : "INTERNAL",
    failure.message,
    res.status,
  );
}
