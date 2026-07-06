/**
 * Client fetch helpers for the `/sourcing` inventory. The load-more read (`fetchLeadsPage`) mirrors
 * the candidate list-fetch (thin wrapper over the gated `GET /api/leads/list`); the mutations reuse
 * the shared `postJson`/`readFailure` envelope helpers so a 409 CONFLICT (already-Promoted lead) or a
 * 422 surfaces as an `ApiFailure` the UI can render. No server imports — safe to bundle client-side.
 */
import type { LeadDetailDTO, LeadListDTO } from "@/lib/validation/lead";
import type { LogOutreachInput } from "@/lib/validation/lead";
import { type ApiResult, postJson, readFailure } from "@/lib/api/client";
import { buildLeadsQuery } from "./leads-query";

/** Fetch the next keyset page for the current filters. Throws on a non-OK response. */
export async function fetchLeadsPage(
  searchParams: URLSearchParams,
  cursor: string,
): Promise<LeadListDTO> {
  const query = buildLeadsQuery(searchParams, cursor);
  const res = await fetch(`/api/leads/list?${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to load more leads.");
  return (await res.json()) as LeadListDTO;
}

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
