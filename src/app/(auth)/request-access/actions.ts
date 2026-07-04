"use server";

import { accessRequestSchema } from "@/lib/validation/auth";
import { AppError } from "@/server/http/app-error";
import { checkRateLimit } from "@/server/http/rate-limit";
import { accessRequestService } from "@/server/services/access-request.service";

/**
 * Server Action: submit an access request. Thin — validates with the shared Zod schema,
 * then delegates to the service (no business logic here).
 *
 * This is PUBLIC (no auth), so it is throttled with a coarse best-effort key before doing any work.
 * The key is a single global bucket (we have no trusted per-caller identity here) — it blunts a
 * flood but is per-instance/in-memory; production should front this with an IP-based limit in a
 * shared store / the platform WAF (see `server/http/rate-limit`).
 */
export async function submitAccessRequest(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    checkRateLimit("access-request", { limit: 20, windowMs: 60_000 });
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMITED") {
      return { ok: false, error: "Too many requests. Please wait a moment and try again." };
    }
    throw err;
  }
  const parsed = accessRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }
  await accessRequestService.submit(parsed.data);
  return { ok: true };
}
