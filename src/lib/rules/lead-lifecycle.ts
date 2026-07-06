/**
 * Source-lead outreach state machine (Wave 2.6) — the core domain rule for the pre-pipeline funnel.
 *
 * PURE + ISOMORPHIC (no `server-only`): unit-tested in isolation and reused by the client to disable
 * dead actions. The `leadService` (server) is the SOLE writer — this module only computes the next
 * legal `status`; it never reasons about `deletedAt` (that is the service's row-level guard).
 *
 * Groups (from `LEAD_STATUSES`):
 *   - Active outreach: Sourced → Outreach 1 → Outreach 2 → Outreach 3 (Final)
 *   - Responded:       Responded — Hot / Responded — Cold
 *   - Closed (manual): No Response / Bad Fit / Future Collaboration (not set by this slice)
 *   - Terminal (system): Promoted
 */
import type { LeadStatus } from "@/lib/constants";

/**
 * Transition table for logging an outreach attempt: advance through the three outreach stages and
 * CAP at Outreach 3 (Final). Any status not listed (Outreach 3, responded, closed, Promoted) HOLDS
 * — the attempt is still recorded + counted by the service, only the label stops advancing.
 */
const OUTREACH_ADVANCE: Partial<Record<LeadStatus, LeadStatus>> = {
  Sourced: "Outreach 1",
  "Outreach 1": "Outreach 2",
  "Outreach 2": "Outreach 3 (Final)",
};

/**
 * Next status after logging an outreach attempt. Advances through the 3 outreach stages, caps at
 * Outreach 3, and HOLDS status for a responded/closed lead (the attempt still counts — you can keep
 * chasing a responded lead). Returns the SAME status when no advance applies; the caller rejects
 * Promoted/deleted before calling (`canLogOutreach`).
 */
export function advanceOnOutreach(status: LeadStatus): LeadStatus {
  return OUTREACH_ADVANCE[status] ?? status;
}

/** The two responded labels for a Hot/Cold response. */
export function setResponse(kind: "Hot" | "Cold"): LeadStatus {
  return kind === "Hot" ? "Responded — Hot" : "Responded — Cold";
}

/** Logging outreach is legal unless the lead has been handed off (Promoted). */
export function canLogOutreach(status: LeadStatus): boolean {
  return status !== "Promoted";
}

/** Marking a response is legal unless the lead has been handed off (Promoted). */
export function canRespond(status: LeadStatus): boolean {
  return status !== "Promoted";
}

/** Promotion is legal unless the lead is already Promoted (terminal — no double-promote). */
export function canPromote(status: LeadStatus): boolean {
  return status !== "Promoted";
}
