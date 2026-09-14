import type { Clock } from "@destaworks/domain/clock";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "./guards";
import { requirePlatformCapability } from "./platform-admin";

/**
 * Support impersonation — the AUTHORIZATION half (SAAS-RESTRUCTURE-PLAN Phase 8).
 *
 * This file decides; it never fetches. The consent record is read from the tenant's own audit
 * ledger by `platform-impersonation.service`, handed here as a plain value, and turned into a
 * scope or a refusal. Keeping the decision free of I/O is what lets every refusal below be tested
 * without a database, and keeps the one function that can authorize a boundary crossing short
 * enough to read in full.
 *
 * ── Three conditions, ALL of them, on EVERY request ─────────────────────────────────────────────
 *
 *  1. The caller is on the platform allowlist and holds `readTenantData`. That comes from
 *     `platform-admin.ts` and from deployment configuration the application cannot write, so no
 *     tenant role value — Owner included — satisfies it.
 *  2. The tenant has consented, and has not withdrawn it. Consent is a fact about the TENANT, so a
 *     platform admin cannot produce it and cannot extend it.
 *  3. The consent has not run out, measured against a `Clock` on this request.
 *
 * Condition 3 is re-evaluated per request on purpose. A cookie `Max-Age`, a signed token's `exp`,
 * or a timer in the console are all assertions the client carries, and a client that keeps sending
 * an expired one is exactly the client this feature has to refuse. The window is stored as an
 * instant, compared here, and nothing the caller sends contributes to the comparison.
 */

/** The consent the tenant granted, as read from its ledger. `null` when it never granted one. */
export interface SupportConsent {
  readonly grantedAt: Date;
  readonly expiresAt: Date;
  /** True once the tenant has withdrawn it; a withdrawal is never removed, only superseded. */
  readonly withdrawn: boolean;
}

/**
 * Proof that one impersonated READ may proceed, right now.
 *
 * Deliberately not a `TenantContext` and not a `PlatformContext`. It carries no `role`, no
 * `membershipId` and no capability list, so it cannot be passed to a repository, to
 * `hasCapability`, or to `hasPlatformCapability` — the same property that makes `PlatformContext`
 * unusable as a tenant scope, applied in the other direction. The only thing that can consume it
 * is the impersonation service, which turns it into a least-privileged scoping context at exactly
 * one call site and returns DTOs.
 *
 * `kind` is a literal so a structurally similar object cannot be substituted for one of these by
 * accident, and so the value reads as what it is in a stack trace.
 */
export interface ImpersonatedReadScope {
  readonly kind: "impersonated-read";
  readonly tenantId: string;
  readonly platformUserId: string;
  readonly grantedAt: Date;
  readonly expiresAt: Date;
}

/**
 * `FORBIDDEN` with one message for every refusal.
 *
 * "You are not a platform admin", "this workspace never consented", "it withdrew consent" and "the
 * window ran out" are four different facts, and telling them apart would let a signed-in stranger
 * probe which workspaces have support sessions open. The operator learns which it was from the log
 * line the service writes; the caller learns only that the answer is no.
 */
function refuse(): never {
  throw new AppError("FORBIDDEN", "You don't have permission to do that");
}

/** Whether a consent record is usable at `now` — withdrawal beats expiry, both fail closed. */
export function isConsentLive(consent: SupportConsent | null, now: Date): boolean {
  if (consent === null || consent.withdrawn) return false;
  return consent.expiresAt.getTime() > now.getTime();
}

/**
 * The gate. Returns a scope, or throws — there is no third outcome and no boolean to ignore.
 *
 * The platform capability is checked FIRST so that a caller who is not a platform admin cannot
 * learn anything about a tenant's consent state from the timing or the shape of the refusal.
 */
export function requireImpersonatedReadScope(
  user: AuthUser,
  tenantId: string,
  consent: SupportConsent | null,
  clock: Clock,
): ImpersonatedReadScope {
  const platform = requirePlatformCapability(user, "readTenantData");
  const now = clock.now();
  if (!isConsentLive(consent, now)) refuse();
  // Narrowing `consent` to non-null is what `isConsentLive` just established; re-reading it here
  // rather than asserting keeps the compiler doing the proof.
  if (consent === null) refuse();

  return {
    kind: "impersonated-read",
    tenantId,
    platformUserId: platform.user.id,
    grantedAt: consent.grantedAt,
    expiresAt: consent.expiresAt,
  };
}
