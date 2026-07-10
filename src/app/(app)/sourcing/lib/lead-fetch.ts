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
  LeadDetailDTO,
  LogOutreachInput,
  UpdateOutreachInput,
} from "@/lib/validation/lead";
import { type ApiResult, getJson, postJson, readFailure } from "@/lib/api/client";

/** Log an outreach attempt (advances the lead's status server-side). Returns the fresh detail. */
export function postOutreach(
  id: string,
  body: LogOutreachInput,
): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  return postJson(`/api/leads/${id}/outreach`, body);
}

/** Mark the lead Responded (Hot/Cold). Returns the fresh detail. */
export function postRespond(
  id: string,
  kind: "hot" | "cold",
): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  return postJson(`/api/leads/${id}/respond`, { kind });
}

/** Promote the lead into the pipeline. Returns the new candidate's id on success. */
export function postPromote(id: string): Promise<ApiResult<{ candidateId: string }>> {
  return postJson(`/api/leads/${id}/promote`, {});
}

/** Restore a soft-deleted lead (clears the delete markers). Returns the fresh detail. */
export function postRestore(id: string): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  return postJson(`/api/leads/${id}/restore`, {});
}

/** Soft-delete the lead (→ reversible trash). Returns `{ ok, id }` or an `ApiFailure`. */
export async function deleteLead(id: string): Promise<ApiResult<{ ok: true; id: string }>> {
  const res = await fetch(`/api/leads/${id}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  return { ok: true, data: (await res.json()) as { ok: true; id: string } };
}

/** Load one lead's full detail (the outreach-history modal seeds from this). */
export function getLeadDetail(id: string): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  return getJson(`/api/leads/${id}`);
}

/** Snooze (`until` a date) or wake (`until: null`) the lead. Returns the fresh detail. */
export function postSnooze(
  id: string,
  until: string | null,
): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  return postJson(`/api/leads/${id}/snooze`, { until });
}

/** Edit one logged attempt (never touches the lead's status). Returns the fresh detail. */
export async function patchOutreachAttempt(
  id: string,
  attemptId: string,
  body: UpdateOutreachInput,
): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  const res = await fetch(`/api/leads/${id}/outreach/${attemptId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  return { ok: true, data: (await res.json()) as { lead: LeadDetailDTO } };
}

/** Delete one logged attempt (denorm re-syncs; status untouched). Returns the fresh detail. */
export async function deleteOutreachAttempt(
  id: string,
  attemptId: string,
): Promise<ApiResult<{ lead: LeadDetailDTO }>> {
  const res = await fetch(`/api/leads/${id}/outreach/${attemptId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return { ok: false, failure: await readFailure(res) };
  return { ok: true, data: (await res.json()) as { lead: LeadDetailDTO } };
}

/** Run one bulk action over the selected ids. Returns `{ affected, skipped }`. */
export function postBulkAction(
  body: BulkLeadActionInput,
): Promise<ApiResult<{ affected: number; skipped: number }>> {
  return postJson("/api/leads/bulk", body);
}

/** Import one ≤200-row chunk. Returns the per-chunk `{ added, skipped }` tallies. */
export function postImportChunk(
  rows: ImportLeadRow[],
): Promise<ApiResult<{ added: number; skipped: number }>> {
  return postJson("/api/leads/import", { rows });
}
