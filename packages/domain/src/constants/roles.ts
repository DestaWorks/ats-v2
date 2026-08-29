/**
 * Roles & capabilities (DECISIONS D3).
 *
 * Six fixed roles (an account has exactly one; `admin` is a role VALUE, not a flag).
 * "Leadership" is NOT a role — it's a capability group derived from role. Guards check
 * capabilities (`hasCapability(role, "viewReports")`), never hardcoded role lists.
 * Custom roles are deferred to v2.
 *
 * `hasCapability` is pure and isomorphic: the client uses it to hide UI; the server
 * enforces it in guards (`requireCapability`). UI hiding is UX — the server is authoritative.
 */

export const ROLES = ["Owner", "Director", "Manager", "Screener", "Associate", "Admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The role a caller collapses to when the stored value is missing or is not one of the six.
 *
 * It is a named constant rather than a literal at each call site so that the guards, which must
 * name no role (see the source scan in `apps/api/src/common/guards/capability.guard.test.ts`),
 * can still fail closed. Changing it is a single, reviewable edit in the one file that is
 * allowed to have an opinion about role names.
 */
export const LEAST_PRIVILEGED_ROLE: Role = "Associate";

/**
 * Coerce a stored role string to a `Role`, least-privilege on anything unrecognised.
 *
 * A role now arrives from a `Membership` row rather than the user, but the rule is unchanged and
 * deliberately paranoid: an unknown, renamed or forged value must narrow access, never widen it.
 */
export function toRole(value: string | null | undefined): Role {
  return typeof value === "string" && isRole(value) ? value : LEAST_PRIVILEGED_ROLE;
}

export const CAPABILITIES = [
  // Leadership capabilities (legacy: unlocked for Owner/Director/Manager/Admin)
  "viewReports",
  "viewAnalytics",
  "bulkImport",
  "viewCredentials",
  "viewCrm",
  "viewClientDiscovery", // Client Discovery (B2B prospecting) — new domain, 2026-08-07
  // Admin capabilities (legacy: Admin Panel + portal config)
  "viewAllNoteTypes", // non-internal candidate notes (legacy: literal `admin` role only)
  "manageUsers",
  "manageRoles",
  "manageAccessRequests",
  "configureClientPortal",
  "viewAudit",
  "purgeCandidate",
  "deleteOpenRole", // hard-delete an Open Role (job requisition) — distinct from manageRoles (accounts)
  "manageAiSettings",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const LEADERSHIP_CAPABILITIES: readonly Capability[] = [
  "viewReports",
  "viewAnalytics",
  "bulkImport",
  "viewCredentials",
  "viewCrm",
  "viewClientDiscovery",
];

const ADMIN_CAPABILITIES: readonly Capability[] = [
  ...LEADERSHIP_CAPABILITIES,
  "viewAllNoteTypes",
  "manageUsers",
  "manageRoles",
  "manageAccessRequests",
  "configureClientPortal",
  "viewAudit",
  "purgeCandidate",
  "deleteOpenRole",
  "manageAiSettings",
];

/** Role → the capabilities it grants. Owner and Admin are superusers. */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  Owner: ADMIN_CAPABILITIES,
  Admin: ADMIN_CAPABILITIES,
  Director: LEADERSHIP_CAPABILITIES,
  Manager: LEADERSHIP_CAPABILITIES,
  Screener: [],
  Associate: [],
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** True if the role is in the leadership group (has any leadership capability). */
export function isLeadership(role: Role): boolean {
  return hasCapability(role, "viewReports");
}
