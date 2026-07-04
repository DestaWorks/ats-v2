/**
 * Client fetch helpers for the candidate detail page — thin wrappers over the gated API routes that
 * turn the uniform `{ error: { code, message, issues? } }` envelope into a discriminated result the
 * UI can render. The shared envelope plumbing (`ApiResult`/`ApiFailure`/`readFailure`/`postJson`/
 * `messageForFailure`) lives in `@/lib/api/client`; only the route-specific unwrap logic is here.
 * The detail DTO carries PII (email/phone, gated licenseNumber), so these responses stay on the
 * authenticated detail page only.
 */
import type { CandidateStatus } from "@/lib/constants";
import type {
  AddNoteInput,
  NoteDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@/lib/validation/candidate";
import { postJson, readFailure, type ApiResult } from "@/lib/api/client";

export { messageForFailure } from "@/lib/api/client";
export type { ApiFailure, FieldIssue } from "@/lib/api/client";

/** Persisted pipeline fields returned by the move route (never candidate PII). */
export interface MovedFields {
  id: string;
  status: CandidateStatus;
  stageOrder: number;
  stageEnteredAt: string;
}

/** POST a gated stage move. Returns the persisted pipeline fields on success. */
export async function postMove(
  id: string,
  toStatus: CandidateStatus,
): Promise<ApiResult<MovedFields>> {
  const res = await postJson<{ candidate: MovedFields }>(`/api/candidates/${id}/move`, {
    toStatus,
  });
  return res.ok ? { ok: true, data: res.data.candidate } : res;
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
  const res = await postJson<{ candidate: Record<string, unknown> }>(
    `/api/candidates/${id}/verify-license`,
    input,
  );
  return res.ok ? { ok: true, data: res.data.candidate } : res;
}

/** POST a new note. Returns the created `NoteDTO` (author from the server session). */
export async function postNote(id: string, input: AddNoteInput): Promise<ApiResult<NoteDTO>> {
  const res = await postJson<{ note: NoteDTO }>(`/api/candidates/${id}/notes`, input);
  return res.ok ? { ok: true, data: res.data.note } : res;
}
