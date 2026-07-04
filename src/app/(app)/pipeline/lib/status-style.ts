/**
 * Static status → Tailwind token maps. The status colors are `@theme` tokens
 * (`--color-status-*` in globals.css), so `bg-status-*` utilities exist — but Tailwind's scanner
 * only sees literal class strings, hence this explicit lookup (no `bg-status-${code}`).
 */
import type { CandidateStatus, LicenseStatus, Track } from "@/lib/constants";

/** Solid background for a stage dot / funnel bar. */
export const STATUS_BG: Record<CandidateStatus, string> = {
  NEW_CANDIDATE: "bg-status-new",
  QUALIFIED_PRESCREEN: "bg-status-qualified",
  INITIAL_SCREENING: "bg-status-screening",
  DESTA_REVIEW: "bg-status-review",
  SUBMITTED_TO_CLIENT: "bg-status-submitted",
  CLIENT_INTERVIEW: "bg-status-interview",
  OFFER_NEGOTIATION: "bg-status-offer",
  OFFER_ACCEPTED: "bg-status-accepted",
  STARTED_DAY1: "bg-status-started",
  NOT_QUALIFIED: "bg-status-not-qualified",
  NO_RESPONSE: "bg-status-no-response",
  CLIENT_REJECTED: "bg-status-rejected",
  FUTURE_PIPELINE: "bg-status-future",
};

/** Short track badge label + tinted classes (18%-ish bg over the brand token). */
export const TRACK_BADGE: Record<Track, { label: string; className: string }> = {
  Clinical: { label: "CLIN", className: "bg-teal/15 text-teal" },
  Prescriber: { label: "RX", className: "bg-navy/15 text-navy" },
  Operations: { label: "OPS", className: "bg-purple/15 text-purple" },
};

/** License-status dot color: Active green, Expired red, everything else orange. */
export function licenseDotClass(status: LicenseStatus): string {
  if (status === "Active") return "bg-green";
  if (status === "Expired") return "bg-red";
  return "bg-orange";
}
