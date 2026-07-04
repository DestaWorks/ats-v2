/**
 * Client fetch helper for the add-candidate form (Wave 2.4) — a thin wrapper over `POST
 * /api/candidates` that turns the uniform `{ error: { code, message, issues? } }` envelope into a
 * discriminated result the form can render (field issues → `form.setError`, other codes →
 * `ErrorState`). The shared envelope plumbing lives in `@/lib/api/client`; only the route-specific
 * unwrap is here. The created candidate carries PII, so this stays on the authenticated
 * add-candidate page only.
 */
import type { CreateCandidateInput } from "@/lib/validation/candidate";
import { postJson, type ApiResult } from "@/lib/api/client";

export { messageForFailure } from "@/lib/api/client";
export type { ApiFailure, FieldIssue } from "@/lib/api/client";

/** POST a new candidate. Returns the created candidate's `id` on success (the detail redirect target). */
export async function postCandidate(
  input: CreateCandidateInput,
): Promise<ApiResult<{ id: string }>> {
  const res = await postJson<{ candidate: { id: string } }>("/api/candidates", input);
  return res.ok ? { ok: true, data: { id: res.data.candidate.id } } : res;
}
