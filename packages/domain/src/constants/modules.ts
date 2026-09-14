/**
 * Modules — what a tenant has PAID FOR, as opposed to what a user is allowed to do. Two axes,
 * ANDed: `tenantHasModule(module) AND hasCapability(viewer, capability)`.
 *
 * Selling through roles instead would mean a downgrade rewrites every user's role and an upgrade
 * cannot restore what they had. Kept apart, a plan change touches one column.
 *
 * See `docs/design/module-entitlements.md`.
 */

export const MODULES = [
  /** Candidates, pipeline, dashboard, screening, trash. Always on — it is the product. */
  "core",
  /** Leads and outreach, before anyone enters the pipeline. */
  "sourcing",
  /** B2B prospecting: CRM and client discovery. */
  "discovery",
  /** The eleven reports, and the analytics views. */
  "reports",
  /** Resume extraction and the daily/weekly briefs. The one module with a per-tenant cost. */
  "ai",
  /** The client-facing portal. */
  "portal",
  /** Licence tracking and verification. */
  "compliance",
] as const;

export type Module = (typeof MODULES)[number];

export function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}

/** Added unconditionally by `modulesForPlan`, so no pricing edit can lock a workspace out. */
export const CORE_MODULE: Module = "core";

export const PLANS = ["internal", "trial", "starter", "growth", "scale"] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(value: string): value is Plan {
  return (PLANS as readonly string[]).includes(value);
}

/** A trial sees everything; the paid tiers are cumulative, so an upgrade only ever adds. */
export const PLAN_MODULES: Record<Plan, readonly Module[]> = {
  // Desta Works' own workspace — the vendor is not a customer and buys nothing.
  internal: MODULES,
  trial: MODULES,
  starter: ["core", "compliance"],
  growth: ["core", "compliance", "sourcing", "reports"],
  scale: MODULES,
};

/**
 * Least-entitlement on an unrecognised plan: the failure is visible (a customer calls) rather than
 * silent (the product is given away), and `core` still resolves so nothing goes offline.
 */
export const FALLBACK_PLAN: Plan = "starter";

export function toPlan(value: string | null | undefined): Plan {
  return typeof value === "string" && isPlan(value) ? value : FALLBACK_PLAN;
}

/** The modules a stored plan string grants, `core` always among them. */
export function modulesForPlan(plan: string | null | undefined): readonly Module[] {
  const granted = PLAN_MODULES[toPlan(plan)];
  return granted.includes(CORE_MODULE) ? granted : [CORE_MODULE, ...granted];
}

/** Takes the resolved list, so no decision point re-derives entitlement from a plan string. */
export function hasModule(modules: readonly Module[], module: Module): boolean {
  return modules.includes(module);
}

/**
 * Which module each capability belongs to — presentation only, for the role editor's grouping.
 * Enforcement stays independent: `hasCapability` for one axis, `@RequireModule` for the other.
 */
export const CAPABILITY_MODULE: Record<string, Module> = {
  viewReports: "reports",
  viewAnalytics: "reports",
  viewCrm: "discovery",
  viewClientDiscovery: "discovery",
  configureClientPortal: "portal",
  manageAiSettings: "ai",
  viewCredentials: "compliance",
  bulkImport: "core",
  viewAllNoteTypes: "core",
  manageUsers: "core",
  manageRoles: "core",
  manageAccessRequests: "core",
  viewAudit: "core",
  purgeCandidate: "core",
  deleteOpenRole: "core",
};

/** Human labels for the module groups, for the role editor's section headings. */
export const MODULE_LABEL: Record<Module, string> = {
  core: "Core ATS",
  sourcing: "Sourcing",
  discovery: "Discovery & CRM",
  reports: "Reports",
  ai: "AI",
  portal: "Client Portal",
  compliance: "Compliance",
};
