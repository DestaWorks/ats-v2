/**
 * Open Roles vocabulary (Wave 3.5, legacy `ATS_OpenRoles` / `ATS_RoleNotes` / `ATS_ClientMatchProfiles`).
 * A "role" here is a client job requisition — distinct from the RBAC `Role` in `./roles.ts`.
 */

export const ROLE_STATUSES = ["Open", "On Hold", "Filled", "Closed"] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];
export function isRoleStatus(value: string): value is RoleStatus {
  return (ROLE_STATUSES as readonly string[]).includes(value);
}

export const ROLE_PRIORITIES = ["P1", "P2", "P3"] as const;
export type RolePriority = (typeof ROLE_PRIORITIES)[number];
export function isRolePriority(value: string): value is RolePriority {
  return (ROLE_PRIORITIES as readonly string[]).includes(value);
}

/** Role-note category — free text in legacy; this is a starter list for the select, not an enum gate. */
export const ROLE_NOTE_CATEGORIES = [
  "General",
  "Client Feedback",
  "Screening",
  "Follow-up",
] as const;

/** Triage-strip badge (legacy `index.html:4734-4790`). */
export const TRIAGE_BADGES = ["HOT", "STALE", "GAP", "EASY", "P1", "P2", "P3"] as const;
export type TriageBadge = (typeof TRIAGE_BADGES)[number];
