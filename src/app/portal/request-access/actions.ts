"use server";

import { portalAccessRequestSchema } from "@/lib/validation/portal";
import { AppError } from "@/server/http/app-error";
import { checkRateLimit } from "@/server/http/rate-limit";
import { portalAccessRequestService } from "@/server/services/portal-access-request.service";

/**
 * Server Action: submit a Client Portal access request. Public (no auth) — mirrors
 * `(auth)/request-access/actions.ts`'s shape exactly (rate-limit first, then validate, then a
 * thin service delegate). Deliberately does NOT reuse `submitAccessRequest`/`AccessRequest` —
 * this grants a `ClientContact` a portal token, not one of the 6 internal RBAC roles.
 */
export async function submitPortalAccessRequest(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    checkRateLimit("portal-access-request", { limit: 20, windowMs: 60_000 });
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") {
      return { ok: false, error: "Too many requests. Please wait a moment and try again." };
    }
    throw err;
  }
  const parsed = portalAccessRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }
  await portalAccessRequestService.submit(parsed.data);
  return { ok: true };
}
