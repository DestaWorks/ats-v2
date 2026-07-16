/**
 * Screening scorecard contract (Wave 3.3) — isomorphic types + zod shared by the screening routes
 * and the `/screening` client. Pure (NO server imports). `action` decides whether the save also
 * attempts a stage move (`advance`/`futurePipeline`); the server re-validates the requested action
 * against its OWN computed score — a client-supplied score is never trusted.
 */
import { z } from "zod";
import { COMM_ITEMS, SCHEDULE_OPTIONS, US_STATES } from "@/lib/constants";
import type { CandidateStatus } from "@/lib/constants";

const commItemIds = COMM_ITEMS.map((c) => c.id) as [string, ...string[]];

export const saveScreeningSchema = z
  .object({
    credentialsHeld: z.array(z.string().max(200)).max(20).default([]),
    statesHeld: z.array(z.enum(US_STATES)).max(20).default([]),
    yearsExp: z.coerce.number().int().min(0).max(60).nullish(),
    schedule: z.enum(SCHEDULE_OPTIONS).nullish(),
    salaryAsk: z.coerce.number().int().min(0).max(999999).nullish(),
    commChecklist: z.array(z.enum(commItemIds)).max(commItemIds.length).default([]),
    notes: z.string().trim().max(5000).nullish(),
    action: z.enum(["save", "advance", "futurePipeline"]).default("save"),
  })
  .strict();
export type SaveScreeningInput = z.infer<typeof saveScreeningSchema>;

// --- response DTOs -----------------------------------------------------------

export interface ScreeningResultDTO {
  sections: {
    cred: number;
    state: number;
    exp: number;
    schedule: number;
    salary: number;
    comm: number;
  };
  totalPct: number;
  decision: "Advance" | "Conditional" | "Hold";
}

/** One candidate in the `/screening` picker — scoped to `SCREENING_ELIGIBLE_STATUSES`. Carries
 *  the client's rules (states/schedule) so the client can live-score without a second round-trip;
 *  the server independently recomputes at save-time regardless (never trusted). */
export interface ScreeningCandidateDTO {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
  statusLabel: string;
  clientId: string | null;
  clientName: string | null;
  clientStates: string[];
  clientSchedule: string | null;
  yearsExp: number | null;
}

export interface ScreeningScorecardDTO {
  id: string;
  candidateId: string;
  result: ScreeningResultDTO;
  notes: string | null;
  scoredById: string;
  scoredAt: string; // ISO
  moved: { toStatus: CandidateStatus } | null;
}
