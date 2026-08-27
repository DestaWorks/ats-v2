/**
 * Client fetch helpers for the `/sourcing` inventory mutations — thin wrappers over the gated
 * API routes reusing the shared `postJson`/`readFailure` envelope helpers so a 409 CONFLICT
 * (already-Promoted lead) or a 422 surfaces as an `ApiFailure` the UI can render. The LIST read
 * has no helper: the RSC serves offset pages directly (`?page=` navigations + router.refresh).
 * No server imports — safe to bundle client-side.
 */
import type {
  BulkLeadActionInput,
  ImportLeadRow,
  LogOutreachInput,
  UpdateOutreachInput,
} from "@/lib/validation/lead";
import { type ApiResult, deleteJson, getJson, patchJson, postJson } from "@/lib/api/client";
import type { DeleteLeadResponse, GetLeadResponse } from "@/app/api/leads/[id]/route";
import type { PostLeadOutreachResponse } from "@/app/api/leads/[id]/outreach/route";
import type {
  DeleteLeadOutreachAttemptResponse,
  PatchLeadOutreachAttemptResponse,
} from "@/app/api/leads/[id]/outreach/[attemptId]/route";
import type { PostLeadPromoteResponse } from "@/app/api/leads/[id]/promote/route";
import type { PostLeadRespondResponse } from "@/app/api/leads/[id]/respond/route";
import type { PostLeadRestoreResponse } from "@/app/api/leads/[id]/restore/route";
import type { PostLeadSnoozeResponse } from "@/app/api/leads/[id]/snooze/route";
import type { PostLeadBulkResponse } from "@/app/api/leads/bulk/route";
import type { PostLeadImportResponse } from "@/app/api/leads/import/route";

/** Log an outreach attempt (advances the lead's status server-side). Returns the fresh detail. */
export function postOutreach(
  id: string,
  body: LogOutreachInput,
): Promise<ApiResult<PostLeadOutreachResponse>> {
  return postJson(`/api/leads/${id}/outreach`, body);
}

/** Mark the lead Responded (Hot/Cold). Returns the fresh detail. */
export function postRespond(
  id: string,
  kind: "hot" | "cold",
): Promise<ApiResult<PostLeadRespondResponse>> {
  return postJson(`/api/leads/${id}/respond`, { kind });
}

/** Promote the lead into the pipeline. Returns the new candidate's id on success. */
export function postPromote(id: string): Promise<ApiResult<PostLeadPromoteResponse>> {
  return postJson(`/api/leads/${id}/promote`, {});
}

/** Restore a soft-deleted lead (clears the delete markers). Returns the fresh detail. */
export function postRestore(id: string): Promise<ApiResult<PostLeadRestoreResponse>> {
  return postJson(`/api/leads/${id}/restore`, {});
}

/** Soft-delete the lead (→ reversible trash). Returns `{ ok, id }` or an `ApiFailure`. */
export function deleteLead(id: string): Promise<ApiResult<DeleteLeadResponse>> {
  return deleteJson(`/api/leads/${id}`);
}

/** Load one lead's full detail (the outreach-history modal seeds from this). */
export function getLeadDetail(id: string): Promise<ApiResult<GetLeadResponse>> {
  return getJson(`/api/leads/${id}`);
}

/** Snooze (`until` a date) or wake (`until: null`) the lead. Returns the fresh detail. */
export function postSnooze(
  id: string,
  until: string | null,
): Promise<ApiResult<PostLeadSnoozeResponse>> {
  return postJson(`/api/leads/${id}/snooze`, { until });
}

/** Edit one logged attempt (never touches the lead's status). Returns the fresh detail. */
export function patchOutreachAttempt(
  id: string,
  attemptId: string,
  body: UpdateOutreachInput,
): Promise<ApiResult<PatchLeadOutreachAttemptResponse>> {
  return patchJson(`/api/leads/${id}/outreach/${attemptId}`, body);
}

/** Delete one logged attempt (denorm re-syncs; status untouched). Returns the fresh detail. */
export function deleteOutreachAttempt(
  id: string,
  attemptId: string,
): Promise<ApiResult<DeleteLeadOutreachAttemptResponse>> {
  return deleteJson(`/api/leads/${id}/outreach/${attemptId}`);
}

/** Run one bulk action over the selected ids. Returns `{ affected, skipped }`. */
export function postBulkAction(
  body: BulkLeadActionInput,
): Promise<ApiResult<PostLeadBulkResponse>> {
  return postJson("/api/leads/bulk", body);
}

/** Import one ≤200-row chunk. Returns the per-chunk `{ added, skipped }` tallies. */
export function postImportChunk(rows: ImportLeadRow[]): Promise<ApiResult<PostLeadImportResponse>> {
  return postJson("/api/leads/import", { rows });
}
