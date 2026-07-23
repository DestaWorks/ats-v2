/**
 * Source-lead statuses — the pre-pipeline outreach lifecycle
 * (legacy `SL_STATUSES`). Leads are promoted into a Candidate.
 */

import type { BadgeTone } from "@/components/ui/badge";

export const LEAD_STATUSES = [
  "Sourced",
  "Outreach 1",
  "Outreach 2",
  "Outreach 3 (Final)",
  "Responded — Hot",
  "Responded — Cold",
  "No Response",
  "Bad Fit",
  "Future Collaboration",
  "Promoted",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/** The channels an outreach attempt can be logged on (validated vs this union in zod). */
export const OUTREACH_CHANNELS = ["email", "phone", "linkedin", "other"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

/**
 * `Badge` tone per lead status (L-9) — isomorphic, tones limited to the Badge union. Active outreach
 * reads `navy`, the final chase `amber`, responded/promoted `success`, and dead ends `danger`.
 */
export const LEAD_STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  Sourced: "neutral",
  "Outreach 1": "navy",
  "Outreach 2": "navy",
  "Outreach 3 (Final)": "amber",
  "Responded — Hot": "success",
  "Responded — Cold": "neutral",
  "No Response": "danger",
  "Bad Fit": "danger",
  "Future Collaboration": "neutral",
  Promoted: "purple", // legacy: filled purple pill
};

/** `Badge` tone for a raw lead-status string; unknown/legacy statuses fall back to `neutral`. */
export function leadStatusTone(status: string): BadgeTone {
  return isLeadStatus(status) ? LEAD_STATUS_TONE[status] : "neutral";
}
