/**
 * Client fetch helpers for `/client-discovery` mutations — thin wrappers over the gated API
 * routes, mirroring `sourcing/lib/lead-fetch.ts`. The LIST read has no helper: the RSC serves
 * offset pages directly. No server imports — safe to bundle client-side.
 */
import type {
  AddProspectContactInput,
  AddProspectsFromSearchInput,
  BulkProspectActionInput,
  UpdateProspectInput,
  ProspectEnvelope,
} from "@destaworks/contracts/validation/prospect";
import { type ApiResult, deleteJson, getJson, patchJson, postJson } from "@/lib/api/client";
import type {
  SoftDeletedResponse as DeleteProspectResponse,
  BulkActionCounts as PostProspectBulkResponse,
  BulkAddCounts as PostProspectBulkAddResponse,
} from "@destaworks/contracts/api";

/** Load one prospect's full detail (contacts + notes). `signal` lets the caller abort a
 *  StrictMode double-invoked fetch (see `getJson`'s doc comment). */
export function getProspectDetail(
  id: string,
  signal?: AbortSignal,
): Promise<ApiResult<ProspectEnvelope>> {
  return getJson(`/api/prospects/${id}`, signal);
}

/** Edit status/owner/notes/website. Returns the fresh detail. */
export function patchProspect(
  id: string,
  body: UpdateProspectInput,
): Promise<ApiResult<ProspectEnvelope>> {
  return patchJson(`/api/prospects/${id}`, body);
}

/** Soft-delete the prospect (→ reversible trash). Returns `{ ok, id }` or an `ApiFailure`. */
export function deleteProspect(id: string): Promise<ApiResult<DeleteProspectResponse>> {
  return deleteJson(`/api/prospects/${id}`);
}

/** Restore a soft-deleted prospect. Returns the fresh detail. */
export function postRestoreProspect(id: string): Promise<ApiResult<ProspectEnvelope>> {
  return postJson(`/api/prospects/${id}/restore`, {});
}

/** Run one bulk action over the selected ids. Returns `{ affected, skipped }`. */
export function postBulkProspectAction(
  body: BulkProspectActionInput,
): Promise<ApiResult<PostProspectBulkResponse>> {
  return postJson("/api/prospects/bulk", body);
}

/** Find contacts at the prospect via Apollo. Returns the fresh detail. */
export function postEnrichApollo(id: string): Promise<ApiResult<ProspectEnvelope>> {
  return postJson(`/api/prospects/${id}/enrich`, {});
}

/** Hunter.io fallback when Apollo has no result. Returns the fresh detail. */
export function postEnrichHunter(id: string): Promise<ApiResult<ProspectEnvelope>> {
  return postJson(`/api/prospects/${id}/enrich-hunter`, {});
}

/** Add a contact manually. Returns the fresh detail. */
export function postAddContact(
  id: string,
  body: AddProspectContactInput,
): Promise<ApiResult<ProspectEnvelope>> {
  return postJson(`/api/prospects/${id}/contacts`, body);
}

/** Delete one contact, scoped to its prospect. Returns the fresh detail. */
export function deleteContact(id: string, contactId: string): Promise<ApiResult<ProspectEnvelope>> {
  return deleteJson(`/api/prospects/${id}/contacts/${contactId}`);
}

/** Bulk-add selected NPPES search-result rows to the pipeline. */
export function postBulkAddFromSearch(
  body: AddProspectsFromSearchInput,
): Promise<ApiResult<PostProspectBulkAddResponse>> {
  return postJson("/api/prospects/bulk-add", body);
}
