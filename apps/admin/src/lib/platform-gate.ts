import type { AuthUser } from "@destaworks/auth/guards";
import { resolvePlatformContext } from "@destaworks/auth/platform-admin";
import type { PlatformContext } from "@destaworks/domain/platform";

/**
 * The console's gate, as a discriminated result rather than a boolean or a redirect.
 *
 * Three outcomes, because the console owes the operator three different answers and must never
 * collapse them into a redirect:
 *
 *  - `granted`   — a verified `PlatformContext`. The only outcome that renders the console.
 *  - `signed-out`— no session at all.
 *  - `refused`   — a real, signed-in tenant user who is not on the platform allowlist.
 *
 * `refused` is a DEAD END on purpose. Bouncing that person to a tenant app would be the console
 * quietly deciding which workspace they belong in, which is the one thing the platform axis is
 * defined not to know (SAAS-RESTRUCTURE-PLAN 6.8: `PlatformContext` carries no `tenantId`).
 *
 * `refused` also covers "the platform plane is not configured here". `resolvePlatformContext`
 * returns `null` for both, and the two are deliberately indistinguishable to a signed-in caller.
 */
export type PlatformGate =
  | { readonly outcome: "granted"; readonly context: PlatformContext }
  | { readonly outcome: "signed-out" }
  | { readonly outcome: "refused" };

/**
 * Pure: the gate decision for an already-authenticated identity, or for nobody.
 *
 * Split from the session read so the decision is testable without a database or a session
 * provider, and so there is exactly one expression of it for every page to share.
 */
export function gateFor(user: AuthUser | null): PlatformGate {
  if (user === null) return { outcome: "signed-out" };
  const context = resolvePlatformContext(user);
  if (context === null) return { outcome: "refused" };
  return { outcome: "granted", context };
}
