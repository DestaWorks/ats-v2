/**
 * Client fetch helpers for saved views (Wave 2.1 closeout) — thin wrappers over the gated
 * `/api/saved-views` routes reusing the shared `postJson`/`deleteJson` envelope helpers from
 * `@/lib/api/client`. Deliberately in the shared `(app)/lib/` (not `pipeline/lib/`) so the
 * candidates-list follow-up can reuse this without duplicating it.
 */
import { deleteJson, postJson, type ApiResult } from "@/lib/api/client";
import type { CreateSavedViewInput, SavedViewDTO } from "@/lib/validation/saved-view";

export function createSavedView(
  input: CreateSavedViewInput,
): Promise<ApiResult<{ savedView: SavedViewDTO }>> {
  return postJson("/api/saved-views", input);
}

export function deleteSavedView(id: string): Promise<ApiResult<{ id: string }>> {
  return deleteJson(`/api/saved-views/${id}`);
}
