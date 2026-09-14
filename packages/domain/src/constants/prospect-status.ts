/**
 * Client Discovery prospect statuses — the B2B pipeline lifecycle for a practice found via NPPES
 * search (or added manually). A qualified prospect becomes a real `Client` outside this domain
 * (no formal "promote" link yet — Client Discovery's core slice tracks the pipeline; converting
 * a Qualified prospect into a Client row is a manual step for now).
 */

import type { BadgeTone } from "./tone";

export const PROSPECT_STATUSES = [
  "Fresh Lead",
  "Researched",
  "Contacted",
  "Qualified",
  "Client",
  "Not a Fit",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export function isProspectStatus(value: string): value is ProspectStatus {
  return (PROSPECT_STATUSES as readonly string[]).includes(value);
}

/** `Badge` tone per prospect status, mirroring `LEAD_STATUS_TONE`'s idiom. */
export const PROSPECT_STATUS_TONE: Record<ProspectStatus, BadgeTone> = {
  "Fresh Lead": "neutral",
  Researched: "navy",
  Contacted: "amber",
  Qualified: "success",
  Client: "purple",
  "Not a Fit": "danger",
};

/** `Badge` tone for a raw prospect-status string; unknown statuses fall back to `neutral`. */
export function prospectStatusTone(status: string): BadgeTone {
  return isProspectStatus(status) ? PROSPECT_STATUS_TONE[status] : "neutral";
}
