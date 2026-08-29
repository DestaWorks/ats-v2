/**
 * Client fetch helpers for the candidate detail page — thin wrappers over the gated API routes that
 * turn the uniform `{ error: { code, message, issues? } }` envelope into a discriminated result the
 * UI can render. The shared envelope plumbing (`ApiResult`/`ApiFailure`/`readFailure`/`postJson`/
 * `messageForFailure`) lives in `@/lib/api/client`; only the route-specific unwrap logic is here.
 * The detail DTO carries PII (email/phone, gated licenseNumber), so these responses stay on the
 * authenticated detail page only.
 */
import type {
  CandidateIdEnvelope,
  MovedCandidateEnvelope as PostCandidateMoveResponse,
  NoteEnvelope as PostCandidateNoteResponse,
  OutreachAttemptEnvelope as PostCandidateOutreachResponse,
  DocumentSummaryEnvelope as PostCandidateResumeResponse,
} from "@destaworks/contracts/validation/envelopes";
import type { CandidateStatus } from "@destaworks/domain/constants";
import type {
  AddNoteInput,
  UpdateCandidateInput,
  UploadCandidateResumeInput,
  VerifyLicenseInput,
} from "@destaworks/contracts/validation/candidate";
import type { LogOutreachInput } from "@destaworks/contracts/validation/lead";
import { patchJson, postJson, type ApiResult } from "@/lib/api/client";

export { messageForFailure } from "@/lib/api/client";
export type { ApiFailure, FieldIssue } from "@/lib/api/client";

/** Persisted pipeline fields returned by the move route (never candidate PII). */
export type MovedFields = PostCandidateMoveResponse["candidate"];

/** POST a gated stage move. Returns the persisted pipeline fields on success. */
export async function postMove(
  id: string,
  toStatus: CandidateStatus,
): Promise<ApiResult<MovedFields>> {
  const res = await postJson<PostCandidateMoveResponse>(`/api/candidates/${id}/move`, {
    toStatus,
  });
  return res.ok ? { ok: true, data: res.data.candidate } : res;
}

/** PATCH profile fields. Returns the (PII-re-gated) candidate row from the route. */
export async function patchCandidate(
  id: string,
  input: UpdateCandidateInput,
): Promise<ApiResult<CandidateIdEnvelope["candidate"]>> {
  const res = await patchJson<CandidateIdEnvelope>(`/api/candidates/${id}`, input);
  return res.ok ? { ok: true, data: res.data.candidate } : res;
}

/** POST a license verification. */
export async function postVerifyLicense(
  id: string,
  input: VerifyLicenseInput,
): Promise<ApiResult<CandidateIdEnvelope["candidate"]>> {
  const res = await postJson<CandidateIdEnvelope>(
    `/api/candidates/${id}/verify-license`,
    input,
  );
  return res.ok ? { ok: true, data: res.data.candidate } : res;
}

/** POST a new note. Returns the created `NoteDTO` (author from the server session). */
export async function postNote(
  id: string,
  input: AddNoteInput,
): Promise<ApiResult<PostCandidateNoteResponse["note"]>> {
  const res = await postJson<PostCandidateNoteResponse>(`/api/candidates/${id}/notes`, input);
  return res.ok ? { ok: true, data: res.data.note } : res;
}

/** POST a resume attach (candidate detail's own Resume tab — no AI/matching involved). Returns
 *  the created `DocumentSummaryDTO`. */
export async function postResumeUpload(
  id: string,
  input: UploadCandidateResumeInput,
): Promise<ApiResult<PostCandidateResumeResponse["document"]>> {
  const res = await postJson<PostCandidateResumeResponse>(`/api/candidates/${id}/resume`, input);
  return res.ok ? { ok: true, data: res.data.document } : res;
}

/** POST an outreach attempt (candidate_log_outreach). Returns the created attempt DTO. */
export async function postOutreach(
  id: string,
  input: LogOutreachInput,
): Promise<ApiResult<PostCandidateOutreachResponse["attempt"]>> {
  const res = await postJson<PostCandidateOutreachResponse>(
    `/api/candidates/${id}/outreach`,
    input,
  );
  return res.ok ? { ok: true, data: res.data.attempt } : res;
}
