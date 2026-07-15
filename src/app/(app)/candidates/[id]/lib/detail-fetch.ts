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
import type { LogOutreachInput, OutreachAttemptDTO } from "@/lib/validation/lead";
import { patchJson, postJson, type ApiResult } from "@/lib/api/client";

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
  const res = await patchJson<{ candidate: Record<string, unknown> }>(
    `/api/candidates/${id}`,
    input,
  );
  return res.ok ? { ok: true, data: res.data.candidate } : res;
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

/** POST an outreach attempt (candidate_log_outreach). Returns the created attempt DTO. */
export async function postOutreach(
  id: string,
  input: LogOutreachInput,
): Promise<ApiResult<OutreachAttemptDTO>> {
  const res = await postJson<{ attempt: OutreachAttemptDTO }>(
    `/api/candidates/${id}/outreach`,
    input,
  );
  return res.ok ? { ok: true, data: res.data.attempt } : res;
}
