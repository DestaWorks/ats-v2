/**
 * Client-contact vocabulary (Wave 4.2, CRM — legacy `index.html:7465-7466`, `Code.gs`
 * `ATS_ClientContacts`). `role` is the stakeholder-influence tier (drives the "champion"/
 * "detractor" strength scoring in a LATER slice — not built yet, but the vocab is stable now).
 */

export const CONTACT_ROLES = [
  "decision_maker",
  "gatekeeper",
  "influencer",
  "user",
  "unknown",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  decision_maker: "Decision Maker",
  gatekeeper: "Gatekeeper",
  influencer: "Influencer",
  user: "End User",
  unknown: "Unknown",
};

export const CONTACT_STATUSES = ["active", "left"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

/** Client profile "priority" tier — free-vocab select, not a DB enum (legacy parity). */
export const CLIENT_PRIORITIES = ["HIGH", "MED", "STANDARD", "NEW"] as const;

/** Client profile "cadence" — how often the account gets a check-in touch. */
export const CLIENT_CADENCES = [
  "Weekly",
  "Bi-weekly",
  "Monthly",
  "Quarterly",
  "As needed",
] as const;

/** Task status (Wave 4.2 slice 2) — real mutable state, unlike legacy's append-a-new-row hack. */
export const CLIENT_TASK_STATUSES = ["open", "done"] as const;

/** Meeting type (Wave 4.2 slice 2, legacy `index.html:7681`) — its OWN field, never shared with
 *  the Communications-tab call/email/note selector (legacy bug: those reused one state variable). */
export const MEETING_TYPES = ["weekly", "monthly", "qbr", "adhoc"] as const;

/** Deal kanban stages (Wave 4.2 slice 3, legacy `index.html:7769`) — the 5 OPEN stages are the
 *  kanban columns; Signed/Lost are closed states shown in a separate section, not columns. */
export const OPEN_DEAL_STAGES = [
  "Lead",
  "Contacted",
  "Meeting",
  "Proposal",
  "Negotiation",
] as const;
export const CLOSED_DEAL_STAGES = ["Signed", "Lost"] as const;
export const DEAL_STAGES = [...OPEN_DEAL_STAGES, ...CLOSED_DEAL_STAGES] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export function isClosedDealStage(stage: string): boolean {
  return (CLOSED_DEAL_STAGES as readonly string[]).includes(stage);
}
