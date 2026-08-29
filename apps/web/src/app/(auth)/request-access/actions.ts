"use server";

import { accessRequestSchema } from "@destaworks/contracts/validation/auth";
import { AppError } from "@destaworks/integrations/http/app-error";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { accessRequestService } from "@destaworks/application/access-request.service";
import { publicTenantService } from "@destaworks/application/public-tenant.service";
import { headers } from "next/headers";

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
    await checkRateLimit("access-request", { limit: 20, windowMs: 60_000 });
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
  try {
    const scope = await publicTenantService.contextForHost(
      (await headers()).get("host") ?? undefined,
    );
    if (!scope) throw new AppError("NOT_FOUND", "No such workspace");

    await accessRequestService.submit(scope, parsed.data);
  } catch (err) {
    if (err instanceof AppError && err.code === "CONFLICT") {
      return { ok: false, error: err.message };
    }
    throw err;
  }
  return { ok: true };
}
