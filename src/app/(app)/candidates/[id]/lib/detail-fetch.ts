/**
 * Client fetch helpers for the candidate detail page — thin wrappers over the gated API routes that
 * turn the uniform `{ error: { code, message, issues? } }` envelope into a discriminated result the
 * UI can render. Mirrors the board's `board-fetch.ts`. The detail DTO carries PII (email/phone,
 * gated licenseNumber), so these responses stay on the authenticated detail page only.
 */
import type { CandidateStatus } from "@/lib/constants";
import type {
  AddNoteInput,
  NoteDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@/lib/validation/candidate";

/** One field-level validation issue from a 422 (`path` is a dotted key, e.g. `"email"`). */
export interface FieldIssue {
  path: string;
  message: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; issues?: FieldIssue[] };
}

/** A failed mutation — the envelope's code/message plus any field issues (for form.setError). */
export interface ApiFailure {
  code: string;
  message: string;
  issues: FieldIssue[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/** Persisted pipeline fields returned by the move route (never candidate PII). */
export interface MovedFields {
  id: string;
  status: CandidateStatus;
  stageOrder: number;
  stageEnteredAt: string;
}

async function readFailure(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  return {
    code: body.error?.code ?? "UNKNOWN",
    message: body.error?.message ?? "Something went wrong. Please try again.",
    issues: body.error?.issues ?? [],
  };
}

/** POST a gated stage move. Returns the persisted pipeline fields on success. */
export async function postMove(
  id: string,
  toStatus: CandidateStatus,
): Promise<ApiResult<MovedFields>> {
  const res = await fetch(`/api/candidates/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStatus }),
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  const body = (await res.json()) as { candidate: MovedFields };
  return { ok: true, data: body.candidate };
}

/** PATCH profile fields. Returns the (PII-re-gated) candidate row from the route. */
export async function patchCandidate(
  id: string,
  input: UpdateCandidateInput,
): Promise<ApiResult<Record<string, unknown>>> {
  const res = await fetch(`/api/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  const body = (await res.json()) as { candidate: Record<string, unknown> };
  return { ok: true, data: body.candidate };
}

/** POST a license verification. */
export async function postVerifyLicense(
  id: string,
  input: VerifyLicenseInput,
): Promise<ApiResult<Record<string, unknown>>> {
  const res = await fetch(`/api/candidates/${id}/verify-license`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  const body = (await res.json()) as { candidate: Record<string, unknown> };
  return { ok: true, data: body.candidate };
}

/** POST a new note. Returns the created `NoteDTO` (author from the server session). */
export async function postNote(id: string, input: AddNoteInput): Promise<ApiResult<NoteDTO>> {
  const res = await fetch(`/api/candidates/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  const body = (await res.json()) as { note: NoteDTO };
  return { ok: true, data: body.note };
}

/** Human-friendly lead-in for a failure — maps the common gated codes, falls back to the message. */
export function messageForFailure(failure: ApiFailure): string {
  if (failure.code === "FORBIDDEN") {
    return failure.message || "You don't have permission to do that.";
  }
  if (failure.code === "UNAUTHORIZED") return "Your session expired. Please sign in again.";
  if (failure.code === "NOT_FOUND") return "This candidate no longer exists.";
  return failure.message || "Something went wrong. Please try again.";
}
