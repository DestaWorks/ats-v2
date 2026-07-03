/**
 * Source-lead statuses — the pre-pipeline outreach lifecycle
 * (legacy `SL_STATUSES`). Leads are promoted into a Candidate.
 */

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

/** Statuses considered "closed / not actively working" (dropped from active lists). */
export const INACTIVE_LEAD_STATUSES: readonly LeadStatus[] = [
  "No Response",
  "Bad Fit",
  "Promoted",
  "Future Collaboration",
];
