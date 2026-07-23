/**
 * Client action helpers for the candidate lifecycle (Restore / Purge). Thin wrappers over the
 * gated API routes that turn the uniform `{ error: { code, message } }` envelope into a
 * discriminated `ApiResult` the UI can surface. The shared plumbing (`ApiResult`/`ApiFailure`/
 * `readFailure`/`postJson`/`messageForFailure`) lives in `@/lib/api/client`; only the route-specific
 * calls + the pure type-to-confirm gate live here (no server imports — safe to bundle client-side).
 */
import { postJson, type ApiResult } from "@/lib/api/client";

export { messageForFailure } from "@/lib/api/client";

/**
 * Type-to-confirm gate for the irreversible Purge action: the operator must retype the candidate's
 * exact name. Both sides are trimmed (leading/trailing whitespace is forgiven), then compared
 * **case-sensitively** — the friction that separates Purge from the reversible Restore. A blank
 * candidate name never confirms (defensive — candidate names are non-empty in practice). Pure +
 * `now`-free so it unit-tests in the node-only runner.
 */
export function canConfirmPurge(typedName: string, candidateName: string): boolean {
  const target = candidateName.trim();
  if (target === "") return false;
  return typedName.trim() === target;
}

/** POST a restore (Trash → back to its original stage). `POST /api/candidates/[id]/restore`. */
export async function restoreCandidate(id: string): Promise<ApiResult<{ id: string }>> {
  const res = await postJson<{ candidate: { id: string } }>(`/api/candidates/${id}/restore`, {});
  return res.ok ? { ok: true, data: res.data.candidate } : res;
}

/** POST a permanent, cascading purge. `POST /api/candidates/[id]/purge` → `{ ok, id }`. */
export async function purgeCandidate(id: string): Promise<ApiResult<{ ok: true; id: string }>> {
  return postJson<{ ok: true; id: string }>(`/api/candidates/${id}/purge`, {});
}
