import { cache } from "react";
import { auth } from "@destaworks/auth/auth";
import type { AuthUser } from "@destaworks/auth/guards";
import { requestContext } from "@destaworks/config/request-context";
import { logger } from "@destaworks/config/logger";
import { setLogContext } from "@destaworks/config/logger/request-context";
import { gateFor, type PlatformGate } from "./platform-gate";

/**
 * The signed-in identity, with NO tenant resolved.
 *
 * `getCurrentUser()` in `@destaworks/auth/guards` cannot serve this console: it resolves a
 * `TenantContext` and answers `null` when the session can act in no tenant. A platform admin who
 * belongs to no workspace is the normal case here, so reading the session directly — identity
 * only, no role, no membership — is the correct read rather than a shortcut around a guard.
 */
export const readSignedInUser = cache(async (): Promise<AuthUser | null> => {
  const session = await auth.api.getSession({ headers: await requestContext().headers() });
  if (!session) return null;
  setLogContext({ userId: session.user.id });
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
});

/** The gate for this request. A refusal is logged by user id — never by email or name. */
export async function platformGate(): Promise<PlatformGate> {
  const gate = gateFor(await readSignedInUser());
  if (gate.outcome === "refused") {
    logger.warn("platform.console.refused", { reason: "not-on-platform-allowlist" });
  }
  return gate;
}
