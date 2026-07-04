/**
 * Client fetch helpers for the board — thin wrappers over the gated API routes that turn the
 * uniform `{ error: { code, message } }` envelope into something the UI can render. Mirrors the
 * resume flow's `messageForError` pattern. No PII ever crosses these (the board DTO omits it).
 */
import type { CandidateStatus } from "@/lib/constants";
import type { BoardResponse } from "@/lib/validation/pipeline";
import type { ApiErrorBody } from "@/lib/api/client";

export interface MoveFailure {
  code: string;
  /** For `STAGE_BLOCKED`, the joined reasons split back into a list; empty otherwise. */
  reasons: string[];
  message: string;
}

export type MoveResult = { ok: true } | { ok: false; failure: MoveFailure };

/** Re-fetch the funnel-grouped board for the given filters (client re-fetch on filter change). */
export async function fetchBoard(params: URLSearchParams): Promise<BoardResponse> {
  const res = await fetch(`/api/candidates?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to load the pipeline board.");
  return (await res.json()) as BoardResponse;
}

/** POST a single gated move. On `422 STAGE_BLOCKED` the reasons come back split for a list. */
export async function postMove(id: string, toStatus: CandidateStatus): Promise<MoveResult> {
  const res = await fetch(`/api/candidates/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStatus }),
  });
  if (res.ok) return { ok: true };

  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  const code = body.error?.code ?? "UNKNOWN";
  const message = body.error?.message ?? "";
  const reasons =
    code === "STAGE_BLOCKED"
      ? message
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return { ok: false, failure: { code, reasons, message } };
}
