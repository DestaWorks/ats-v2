/**
 * Roles & capabilities (DECISIONS D3, as amended by tenant-managed roles).
 *
 * Each TENANT owns its roles as rows in `access_roles`; the six below are the TEMPLATES those rows
 * are cloned from. A capability decision is therefore made against a resolved capability SET, never
 * a role name — with custom roles a name genuinely does not determine access.
 *
 * `hasCapability` is pure and isomorphic: the client hides UI with it, the server enforces it.
 */

/** The built-in templates every new tenant is seeded with. Not the roles that exist at runtime. */
export const ROLES = ["Owner", "Director", "Manager", "Screener", "Associate", "Admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** What a missing or unrecognised stored role collapses to. Named, so guards need name no role. */
export const LEAST_PRIVILEGED_ROLE: Role = "Associate";

/** Coerce a stored role string to a `Role`. An unknown value must narrow access, never widen it. */
export function toRole(value: string | null | undefined): Role {
  return typeof value === "string" && isRole(value) ? value : LEAST_PRIVILEGED_ROLE;
}

export const CAPABILITIES = [
  // Leadership capabilities
  "viewReports",
  "viewAnalytics",
  "bulkImport",
  "viewCredentials",
  "viewCrm",
  "viewClientDiscovery", // Client Discovery (B2B prospecting) — new domain, 2026-08-07
  // Admin capabilities
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

/**
 * The capability tiers, each a superset of the one before it.
 *
 * Six role NAMES, five distinct grants: `Owner` and `Admin` are deliberately identical (D3 makes
 * `admin` a role value rather than an account flag). Every other pair differs, because a role that
 * grants exactly what another grants is a name a customer will assign expecting more.
 */
/**
 * Two TRACKS below leadership, not two rungs.
 *
 * Screening a clinician means reading their licence number, so `Screener` holds the PII tier.
 * Running a desk means reading the numbers, so `Manager` holds reporting. Neither is above the
 * other and neither contains the other — a Manager has no business in licence numbers, which is a
 * decision about PII rather than seniority. They converge at `Director`.
 */
const SCREENING_CAPABILITIES: readonly Capability[] = ["viewCredentials"];

const DESK_CAPABILITIES: readonly Capability[] = ["viewReports", "viewAnalytics"];

const LEADERSHIP_CAPABILITIES: readonly Capability[] = [
  ...SCREENING_CAPABILITIES,
  ...DESK_CAPABILITIES,
  "bulkImport",
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

/** Role -> the capabilities its TEMPLATE grants. A tenant's row starts here and may diverge. */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  Owner: ADMIN_CAPABILITIES,
  Admin: ADMIN_CAPABILITIES,
  Director: LEADERSHIP_CAPABILITIES,
  Manager: DESK_CAPABILITIES,
  Screener: SCREENING_CAPABILITIES,
  Associate: [],
};

/**
 * Anything carrying a resolved capability set. Structural and narrower than `TenantContext`, so a
 * non-member viewer (a portal contact) is admitted by widening one type, not every signature.
 */
export interface CapabilityHolder {
  readonly capabilities: readonly Capability[];
}

/**
 * The authorization primitive. Takes the VIEWER: a role name would resolve against the template
 * rather than the tenant's row, reporting what the role granted when shipped.
 */
export function hasCapability(viewer: CapabilityHolder, capability: Capability): boolean {
  return viewer.capabilities.includes(capability);
}

/**
 * An unrecognised code is DROPPED, not kept or thrown on: a row from another build must never
 * widen access, and refusing outright would take a workspace offline over one stale string.
 */
export function toCapabilities(stored: readonly string[]): readonly Capability[] {
  return stored.filter((value): value is Capability =>
    (CAPABILITIES as readonly string[]).includes(value),
  );
}

/** What a BUILT-IN template grants, for seeding and for defaults. Never an access decision. */
export function templateGrants(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** True if the viewer is in the leadership group (holds any leadership capability). */
export function isLeadership(viewer: CapabilityHolder): boolean {
  return hasCapability(viewer, "viewReports");
}
