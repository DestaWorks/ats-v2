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

export const CAPABILITIES = [
  // Leadership capabilities (legacy: unlocked for Owner/Director/Manager/Admin)
  "viewReports",
  "viewAnalytics",
  "bulkImport",
  "viewCredentials",
  "viewCrm",
  // Admin capabilities (legacy: Admin Panel + portal config)
  "manageUsers",
  "manageRoles",
  "manageAccessRequests",
  "configureClientPortal",
  "viewAudit",
  "purgeCandidate",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const LEADERSHIP_CAPABILITIES: readonly Capability[] = [
  "viewReports",
  "viewAnalytics",
  "bulkImport",
  "viewCredentials",
  "viewCrm",
];

const ADMIN_CAPABILITIES: readonly Capability[] = [
  ...LEADERSHIP_CAPABILITIES,
  "manageUsers",
  "manageRoles",
  "manageAccessRequests",
  "configureClientPortal",
  "viewAudit",
  "purgeCandidate",
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

/** The roles that form the "leadership" capability group (for display/labelling only). */
export const LEADERSHIP_ROLES: readonly Role[] = ["Owner", "Director", "Manager", "Admin"];

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** True if the role is in the leadership group (has any leadership capability). */
export function isLeadership(role: Role): boolean {
  return hasCapability(role, "viewReports");
}
