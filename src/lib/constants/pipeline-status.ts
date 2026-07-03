/**
 * Pipeline statuses — stored as stable CODES with a numeric `order` ordinal and a
 * display label (DECISIONS: status is a code + stage_order, never the label string).
 * Scoring, stage gates, and funnels key off the code/order so labels can be re-worded
 * without breaking logic.
 *
 * Ported from the legacy `STATUSES` (13 stages) and `STAGE_ALERTS` (per-stage SLA days).
 */

export const PIPELINE_STAGES = [
  { code: "NEW_CANDIDATE", order: 0, label: "New Candidate", kind: "active", slaDays: 3 },
  {
    code: "QUALIFIED_PRESCREEN",
    order: 1,
    label: "Qualified (Pre-Screen)",
    kind: "active",
    slaDays: 2,
  },
  { code: "INITIAL_SCREENING", order: 2, label: "Initial Screening", kind: "active", slaDays: 3 },
  { code: "DESTA_REVIEW", order: 3, label: "Desta Review", kind: "active", slaDays: 5 },
  {
    code: "SUBMITTED_TO_CLIENT",
    order: 4,
    label: "Submitted to Client",
    kind: "active",
    slaDays: 7,
  },
  { code: "CLIENT_INTERVIEW", order: 5, label: "Client Interview", kind: "active", slaDays: 7 },
  { code: "OFFER_NEGOTIATION", order: 6, label: "Offer / Negotiation", kind: "active", slaDays: 5 },
  { code: "OFFER_ACCEPTED", order: 7, label: "Offer Accepted", kind: "active", slaDays: 3 },
  { code: "STARTED_DAY1", order: 8, label: "Started (Day 1)", kind: "active", slaDays: null },
  { code: "NOT_QUALIFIED", order: 9, label: "Not Qualified", kind: "terminal", slaDays: null },
  { code: "NO_RESPONSE", order: 10, label: "No Response", kind: "terminal", slaDays: null },
  { code: "CLIENT_REJECTED", order: 11, label: "Client Rejected", kind: "terminal", slaDays: null },
  { code: "FUTURE_PIPELINE", order: 12, label: "Future Pipeline", kind: "terminal", slaDays: null },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type CandidateStatus = PipelineStage["code"];

const BY_CODE: Record<CandidateStatus, PipelineStage> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.code, s]),
) as Record<CandidateStatus, PipelineStage>;

export const ALL_STATUS_CODES: readonly CandidateStatus[] = PIPELINE_STAGES.map((s) => s.code);

export const ACTIVE_STATUS_CODES: readonly CandidateStatus[] = PIPELINE_STAGES.filter(
  (s) => s.kind === "active",
).map((s) => s.code);

export const TERMINAL_STATUS_CODES: readonly CandidateStatus[] = PIPELINE_STAGES.filter(
  (s) => s.kind === "terminal",
).map((s) => s.code);

/** Runtime type guard — is this string a valid status code? */
export function isCandidateStatus(value: string): value is CandidateStatus {
  return value in BY_CODE;
}

export function getStage(code: CandidateStatus): PipelineStage {
  return BY_CODE[code];
}

export function statusLabel(code: CandidateStatus): string {
  return BY_CODE[code].label;
}

export function statusOrder(code: CandidateStatus): number {
  return BY_CODE[code].order;
}

export function isTerminalStatus(code: CandidateStatus): boolean {
  return BY_CODE[code].kind === "terminal";
}

/** SLA days for a stage, or null if the stage has no SLA (Started + terminals). */
export function statusSlaDays(code: CandidateStatus): number | null {
  return BY_CODE[code].slaDays;
}

// --- Legacy interop (migration ETL only) -----------------------------------
// The legacy Sheet stores the full label string, e.g. "4 - Submitted to Client".
// These helpers convert between that and the new code. Keep out of business logic.

export function toLegacyStatusLabel(code: CandidateStatus): string {
  const s = BY_CODE[code];
  return `${s.order} - ${s.label}`;
}

const LEGACY_LABEL_TO_CODE: Record<string, CandidateStatus> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [`${s.order} - ${s.label}`, s.code]),
);

/** Parse a legacy "N - Label" string to a code. Returns undefined if unrecognized. */
export function fromLegacyStatusLabel(label: string): CandidateStatus | undefined {
  return LEGACY_LABEL_TO_CODE[label.trim()];
}
