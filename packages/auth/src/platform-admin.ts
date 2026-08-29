import {
  hasPlatformCapability,
  PLATFORM_CAPABILITIES,
  type PlatformCapability,
  type PlatformContext,
} from "@destaworks/domain/platform";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "./guards";

/**
 * The platform-admin plane (SAAS-RESTRUCTURE-PLAN 6.8).
 *
 * A platform admin is on a DIFFERENT AXIS from a tenant's Owner. Nothing a tenant can do — no role
 * value, no capability, no membership, no invitation — puts anyone on this list, because the list
 * is not in the database at all. It is deployment configuration, and the application has no write
 * path to it. The done-when of 6.8 ("no tenant role value, including Owner, can reach another
 * tenant's data") is therefore true by construction rather than by a check somebody has to
 * remember: reaching across tenants needs a `PlatformContext`, and only this file mints one.
 *
 * ── Why USER IDS, and not emails ────────────────────────────────────────────────────────────────
 *
 * An email allowlist is the obvious spelling and it is the wrong one. A tenant Admin already holds
 * `manageUsers`, which can create accounts. If the plane keyed on email, an Admin could create an
 * account at a listed address — or, worse, one that has not signed up yet — set its password, and
 * sign in with platform powers. That is privilege escalation from inside a tenant, which is the
 * one thing this axis exists to make impossible.
 *
 * A user id is a `cuid` minted by the database when the row is created. No application path lets
 * anyone choose one, so an id in the environment can only ever name an account that already
 * existed when the operator read it off. Configuring it costs one lookup at install time and buys
 * a boundary the app cannot cross.
 *
 * ── Why not a table, yet ────────────────────────────────────────────────────────────────────────
 *
 * A `platform_admins` table would be an admin plane guarded by the application that the admin
 * plane guards — and, this phase, another schema change during a migration freeze. Phase 8 builds
 * the console and can move the list into storage with its own audit trail; until then, "grant" is
 * an environment change and a redeploy, which is a slow, logged, two-person operation. That is the
 * right speed for this.
 */

/** Environment variable holding a comma-separated list of platform-admin user ids. */
const PLATFORM_ADMIN_IDS_ENV = "PLATFORM_ADMIN_USER_IDS";

/**
 * Read the allowlist. Parsed per call, not frozen at import, so that a deploy which changes the
 * variable takes effect without relying on a process restart having happened first — and so a test
 * can set it without module-cache surgery.
 */
function allowlist(): ReadonlySet<string> {
  const raw = process.env[PLATFORM_ADMIN_IDS_ENV] ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * True when the plane is configured at all.
 *
 * Worth exposing separately: an unconfigured plane and a configured plane that refuses this
 * particular user are the same denial to a caller, but very different to an operator reading logs
 * after a support request went nowhere.
 */
export function platformPlaneEnabled(): boolean {
  return allowlist().size > 0;
}

/**
 * The platform context for a signed-in user, or `null`.
 *
 * Takes the already-authenticated `AuthUser` rather than resolving a session itself, so it cannot
 * become a second authentication path. It reads nothing the client sent.
 *
 * Every platform admin currently holds every platform capability. That is stated once, here, and
 * the capability set is still threaded through the calls rather than collapsed to a boolean —
 * splitting "read a tenant's data" from "suspend a tenant" is a change to this one line when
 * Phase 8's console needs it, not a rewrite of every call site.
 */
export function resolvePlatformContext(user: AuthUser): PlatformContext | null {
  if (!allowlist().has(user.id)) return null;
  return {
    user: { id: user.id, email: user.email },
    capabilities: PLATFORM_CAPABILITIES,
  };
}

/**
 * Require a platform capability, or throw.
 *
 * `FORBIDDEN` in both failure cases, with one message: a signed-in user must not be able to tell
 * "there is no platform plane here" from "you are not on it".
 */
export function requirePlatformCapability(
  user: AuthUser,
  capability: PlatformCapability,
): PlatformContext {
  const context = resolvePlatformContext(user);
  if (context === null || !hasPlatformCapability(context, capability)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
  return context;
}
