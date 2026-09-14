/**
 * Client fetch helpers for the board — through `lib/api/client`, like every other browser call,
 * so the envelope is read in one place. These add only what the board needs on top: splitting a
 * `STAGE_BLOCKED` message back into the list of reasons the UI renders. No PII ever crosses these (the board DTO omits it).
 */
import type { GetCandidatesResponse } from "@destaworks/contracts/http/pipeline";
import type { CandidateStatus } from "@destaworks/domain/constants";
import { getJson, messageForFailure, postJson } from "@/lib/api/client";

/** The board arm of `GET /api/candidates` (no `column` param). */
type BoardPayload = Extract<GetCandidatesResponse, { columns: unknown }>;

/** The single-column load-more arm of `GET /api/candidates` (`column` + `cursor`). */
type ColumnPayload = Extract<GetCandidatesResponse, { items: unknown }>;

export interface MoveFailure {
  code: string;
  /** For `STAGE_BLOCKED`, the joined reasons split back into a list; empty otherwise. */
  reasons: string[];
  message: string;
}

export type MoveResult = { ok: true } | { ok: false; failure: MoveFailure };

/** Re-fetch the funnel-grouped board for the given filters (client re-fetch on filter change). */
export async function fetchBoard(params: URLSearchParams): Promise<BoardPayload> {
  const result = await getJson<BoardPayload>(`/api/candidates?${params.toString()}`);
  if (!result.ok) throw new Error(messageForFailure(result.failure));
  return result.data;
}

/**
 * Fetch the next per-column keyset page (the column "Load more"). Carries the board's current URL
 * filters (`params`) plus the target `column` + its opaque `cursor`; returns a single-column
 * `ColumnPageDTO`. The board appends `items` to that column and advances its `nextCursor`/`hasMore`.
 */
export async function fetchColumnPage(
  params: URLSearchParams,
  column: CandidateStatus,
  cursor: string,
): Promise<ColumnPayload> {
  const out = new URLSearchParams(params.toString());
  out.set("column", column);
  out.set("cursor", cursor);
  const result = await getJson<ColumnPayload>(`/api/candidates?${out.toString()}`);
  if (!result.ok) throw new Error(messageForFailure(result.failure));
  return result.data;
}

/** POST a single gated move. On `422 STAGE_BLOCKED` the reasons come back split for a list. */
export async function postMove(id: string, toStatus: CandidateStatus): Promise<MoveResult> {
  const result = await postJson<unknown>(`/api/candidates/${id}/move`, { toStatus });
  if (result.ok) return { ok: true };

  const { code, message } = result.failure;
  const reasons =
    code === "STAGE_BLOCKED"
      ? message
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return { ok: false, failure: { code, reasons, message } };
}
