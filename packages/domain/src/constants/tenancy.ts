/**
 * Tenancy vocabulary (SAAS-RESTRUCTURE-PLAN 6.5/6.8) — the names and shapes that both the request
 * edge and the server share when deciding *which tenant a request is acting in*.
 *
 * Nothing here decides anything. Every value below describes a CLAIM the client supplied — a
 * subdomain label, a path segment, a cookie value. A claim becomes a `TenantContext` only after
 * `packages/auth/src/tenant-context.ts` has matched it against an active `Membership`. Keeping the
 * vocabulary in `domain` and the decision in `auth` is what stops a second, weaker resolution path
 * from growing next to the first one.
 */

/** Membership lifecycle. Only `active` grants access; the other two exist so that fact is auditable. */
export const MEMBERSHIP_STATUSES = ["active", "invited", "removed"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function isMembershipStatus(value: string): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

/** Tenant lifecycle. `suspended` is a live tenant whose members are refused until it is restored. */
export const TENANT_STATUSES = ["active", "trial", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export function isTenantStatus(value: string): value is TenantStatus {
  return (TENANT_STATUSES as readonly string[]).includes(value);
}

/**
 * The remembered active tenant, as a slug.
 *
 * HttpOnly like `portal_token`, not because the value is a secret — it is a workspace slug the
 * user can read in their own URL bar — but because nothing client-side has any business acting on
 * it. The server re-verifies it against a membership on every single request, so tampering with it
 * buys an attacker a 403, never another tenant's data.
 */
export const TENANT_COOKIE = "dw_tenant";

/**
 * The path form of a tenant claim: `/t/<slug>/...`.
 *
 * A single reserved first segment rather than treating any first segment as a slug — otherwise
 * every existing route (`/pipeline`, `/clients`, `/api/...`) would read as a tenant name, and
 * adding a top-level route later could silently shadow a real tenant.
 */
export const TENANT_PATH_PREFIX = "t";

/**
 * Host labels that are infrastructure, never tenants. A tenant that could take `api` or `admin`
 * as its slug would be handed the hostname of another part of the platform.
 *
 * This is the deny-list for BOTH directions: subdomain claims are ignored when they match, and
 * tenant creation must reject a slug in this set (Phase 8 owns the create form; the set lives here
 * so both use the same one).
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "static",
  "assets",
  "cdn",
  "mail",
  "staging",
  "preview",
  "localhost",
];

/**
 * Slug grammar: a DNS label, because a slug has to survive being a subdomain. Lowercase
 * alphanumerics and inner hyphens, 1–63 characters, no leading or trailing hyphen.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * True when `value` is a syntactically usable tenant slug that is not reserved.
 *
 * Deliberately case-sensitive: callers normalise first (`normaliseTenantSlug`). A validator that
 * silently lowercased would let `Acme` and `acme` both pass here and then diverge at the database
 * lookup, which is exactly the kind of near-miss that turns into "works on my machine".
 */
export function isTenantSlug(value: string): boolean {
  if (!SLUG_PATTERN.test(value)) return false;
  return !RESERVED_TENANT_SLUGS.includes(value);
}

/** Trim and lowercase a candidate slug so comparison and lookup use one canonical form. */
export function normaliseTenantSlug(value: string): string {
  return value.trim().toLowerCase();
}
