/**
 * Client fetch helper for the add-candidate form (Wave 2.4) — a thin wrapper over `POST
 * /api/candidates` that turns the uniform `{ error: { code, message, issues? } }` envelope into a
 * discriminated result the form can render (field issues → `form.setError`, other codes →
 * `ErrorState`). Mirrors the detail page's `detail-fetch.ts`. The created candidate carries PII, so
 * this stays on the authenticated add-candidate page only.
 */
import type { CreateCandidateInput } from "@/lib/validation/candidate";

/** One field-level validation issue from a 422 (`path` is a dotted key, e.g. `"email"`). */
export interface FieldIssue {
  path: string;
  message: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; issues?: FieldIssue[] };
}

/** A failed create — the envelope's code/message plus any field issues (for `form.setError`). */
export interface ApiFailure {
  code: string;
  message: string;
  issues: FieldIssue[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

async function readFailure(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return {
    code: body.error?.code ?? "UNKNOWN",
    message: body.error?.message ?? "Something went wrong. Please try again.",
    issues: body.error?.issues ?? [],
  };
}

/** POST a new candidate. Returns the created candidate's `id` on success (the detail redirect target). */
export async function postCandidate(
  input: CreateCandidateInput,
): Promise<ApiResult<{ id: string }>> {
  const res = await fetch("/api/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  const body = (await res.json()) as { candidate: { id: string } };
  return { ok: true, data: { id: body.candidate.id } };
}

/** Human-friendly lead-in for a non-field failure — maps the common gated codes, falls back to message. */
export function messageForFailure(failure: ApiFailure): string {
  if (failure.code === "FORBIDDEN") {
    return failure.message || "You don't have permission to do that.";
  }
  if (failure.code === "UNAUTHORIZED") return "Your session expired. Please sign in again.";
  return failure.message || "Something went wrong. Please try again.";
}
