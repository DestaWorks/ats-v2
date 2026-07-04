/**
 * Pipeline board contract (Wave 2.1) — the isomorphic interface shared by the board read
 * service, the API routes, and the client board. Pure types + zod (no server imports), so the
 * frontend imports the same response shapes and request schemas the server validates against.
 *
 * See `docs/design/wave-2.1-pipeline.md`. The board is funnel-grouped: the 9 ACTIVE stages are
 * always-present columns (order 0..8), the 4 terminal states are summarized (counts always,
 * card lists only when `includeTerminal`). Cards NEVER carry `licenseNumber`; they DO carry a
 * `score` (fit `pct`, or `null`) now that the `client_rules` table exists (candidate-scoring wave).
 */
import { z } from "zod";
import {
  ALL_STATUS_CODES,
  TRACKS,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";

/** Client-safe card projection. NO `licenseNumber`; carries the fit `score` (pct, or null). */
export interface CandidateCardDTO {
  id: string;
  /** PII — the board is auth-gated, so a name is fine; `licenseNumber` never is. */
  name: string;
  track: Track;
  credential: string | null;
  licenseState: string | null;
  licenseStatus: LicenseStatus;
  clientId: string | null;
  clientName: string | null;
  status: CandidateStatus;
  stageOrder: number;
  daysInStage: number;
  isOverdue: boolean;
  isStuck: boolean;
  /**
   * Candidate's fit for the assigned client as a `pct` (0–100), or `null` when there's nothing to
   * score against (no client / no rules / the rules constrain nothing). `null` renders as "—",
   * never as "0%"; a real `0` is a legitimate low score and DOES render.
   */
  score: number | null;
}

/** One of the 9 active-stage columns (always present, even when empty). */
export interface BoardColumn {
  status: CandidateStatus;
  label: string;
  stageOrder: number;
  count: number;
  candidates: CandidateCardDTO[];
}

/** A terminal state's summary — `candidates` present only when `includeTerminal`. */
export interface BoardTerminal {
  status: CandidateStatus;
  label: string;
  count: number;
  candidates?: CandidateCardDTO[];
}

/** The funnel-grouped board payload the client renders directly (no client-side grouping). */
export interface BoardResponse {
  columns: BoardColumn[];
  terminal: BoardTerminal[];
  meta: { total: number; active: number; overdue: number; stuck: number };
}

/** Partial-success summary from a bulk move — one blocked id never rolls back the valid moves. */
export interface BulkMoveResponse {
  moved: string[];
  blocked: { id: string; reason: string }[];
}

/** One active-stage funnel bar for the dashboard (count comes from a `groupBy`, not a full load). */
export interface DashboardStatColumn {
  status: CandidateStatus;
  label: string;
  count: number;
}

/**
 * Dashboard summary — headline counts (from a per-status `groupBy`), the active-stage funnel, and a
 * SMALL "needs attention" list (overdue/stuck), computed WITHOUT loading the whole candidate table.
 */
export interface DashboardStatsDTO {
  total: number;
  active: number;
  terminal: number;
  columns: DashboardStatColumn[];
  attention: CandidateCardDTO[];
}

// --- request schemas (server validates; client may reuse) -------------------

const candidateStatusSchema = z.enum(
  ALL_STATUS_CODES as readonly [CandidateStatus, ...CandidateStatus[]],
);

/** Body for `POST /api/candidates/:id/move`. */
export const moveInputSchema = z.object({
  toStatus: candidateStatusSchema,
});
export type MoveInput = z.infer<typeof moveInputSchema>;

/** Body for `POST /api/candidates/bulk-move` (partial-success, gated per id). */
export const bulkMoveInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  toStatus: candidateStatusSchema,
});
export type BulkMoveInput = z.infer<typeof bulkMoveInputSchema>;

/** Query for `GET /api/candidates` (board read). All filters optional. */
export const boardQuerySchema = z.object({
  status: candidateStatusSchema.optional(),
  track: z.enum(TRACKS).optional(),
  clientId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  // Query strings are always strings — only "1"/"true" enable terminal card lists.
  includeTerminal: z.preprocess((v) => v === "1" || v === "true", z.boolean()),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;
