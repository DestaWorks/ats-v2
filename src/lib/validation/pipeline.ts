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
  ACTIVE_STATUS_CODES,
  ALL_STATUS_CODES,
  LICENSE_STATUSES,
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

/**
 * One of the 9 active-stage columns (always present, even when empty). `count` is the TRUE total
 * for this status (from the filtered `groupBy`); `candidates` is the FIRST page only, with
 * `nextCursor`/`hasMore` driving the per-column "Load more" (a `ColumnPageDTO` appends the rest).
 */
export interface BoardColumn {
  status: CandidateStatus;
  label: string;
  stageOrder: number;
  count: number;
  candidates: CandidateCardDTO[];
  /**
   * Per-column keyset cursor for the next page; `null` ⇒ this column is fully loaded. Optional at
   * the type level (like `BoardTerminal`) so existing board consumers compile unchanged; the board
   * service ALWAYS populates it.
   */
  nextCursor?: string | null;
  hasMore?: boolean;
}

/** A terminal state's summary — `candidates` present only when `includeTerminal` (then paginated). */
export interface BoardTerminal {
  status: CandidateStatus;
  label: string;
  count: number;
  candidates?: CandidateCardDTO[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

/** One column's load-more page (returned by `GET /api/candidates?column=<status>&cursor=<c>`). */
export interface ColumnPageDTO {
  status: CandidateStatus;
  items: CandidateCardDTO[];
  nextCursor: string | null;
  hasMore: boolean;
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

/** Only the 9 active stages are paginatable columns (a `column=` load-more targets one of them). */
const activeStatusSchema = z.enum(
  ACTIVE_STATUS_CODES as readonly [CandidateStatus, ...CandidateStatus[]],
);

/** A query-string presence flag — only "1"/"true" enable it (mirrors `includeTerminal`). */
export const boolFlagSchema = z.preprocess((v) => v === "1" || v === "true", z.boolean());

/** Comma-separated `tags=a,b,c` → a trimmed non-empty array, or `undefined` when absent/empty. */
export const tagsParamSchema = z.preprocess(
  (v) =>
    typeof v === "string" && v.length > 0
      ? v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
  z.array(z.string().min(1)).optional(),
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

/**
 * Query for `GET /api/candidates` (board read + per-column load-more). All filters optional.
 * `column` (+ `cursor`) switches to single-column load-more mode → a `ColumnPageDTO`. `mine` is a
 * presence flag — the route resolves `createdById` from the SESSION, never a client-supplied id.
 */
export const boardQuerySchema = z.object({
  status: candidateStatusSchema.optional(),
  track: z.enum(TRACKS).optional(),
  clientId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  tags: tagsParamSchema,
  licenseStatus: z.enum(LICENSE_STATUSES).optional(),
  mine: boolFlagSchema,
  overdue: boolFlagSchema,
  stuck: boolFlagSchema,
  // Query strings are always strings — only "1"/"true" enable terminal card lists.
  includeTerminal: boolFlagSchema,
  // Per-column load-more: the target column + its opaque keyset cursor.
  column: activeStatusSchema.optional(),
  cursor: z.string().min(1).optional(),
});
export type BoardQuery = z.infer<typeof boardQuerySchema>;

/**
 * Query for `GET /api/candidates/list` (the flat browse list's load-more). Mirrors the board
 * filters + a DB-backed `sort` (Newest/Oldest; Name A–Z deferred per OQ-4) + the keyset `cursor`.
 */
export const listQuerySchema = z.object({
  status: candidateStatusSchema.optional(),
  track: z.enum(TRACKS).optional(),
  clientId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  tags: tagsParamSchema,
  licenseStatus: z.enum(LICENSE_STATUSES).optional(),
  mine: boolFlagSchema,
  overdue: boolFlagSchema,
  stuck: boolFlagSchema,
  /** Score-based server filter (fit ≥ HOT_SCORE). Computed server-side over the full filtered set. */
  hot: boolFlagSchema,
  /** `newest`/`oldest` are DB-native (createdAt); `fit` sorts by the computed fit score, desc. */
  sort: z.enum(["newest", "oldest", "fit"]).default("newest"),
  /** 1-based page for OFFSET pagination. Anything not a positive int falls back to page 1. */
  page: z.coerce.number().int().min(1).catch(1),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** The list's user-facing sort options. `newest`/`oldest` are DB sorts; `fit` sorts by score. */
export type ListSort = "newest" | "oldest" | "fit";

/**
 * Map the list's `sort` to the repository's DB `orderBy`. `fit` has no DB column, so it uses
 * `createdAt_desc` as its STABLE base order — the service re-sorts the scored set by fit on top.
 */
export function listSortToOrderBy(sort: ListSort): "createdAt_desc" | "createdAt_asc" {
  return sort === "oldest" ? "createdAt_asc" : "createdAt_desc";
}
