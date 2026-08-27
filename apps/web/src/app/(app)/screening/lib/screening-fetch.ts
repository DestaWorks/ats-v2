/**
 * Client fetch helpers for Screening (Wave 3.3) — thin wrappers over the gated
 * `/api/screening/*` routes reusing the shared `getJson`/`postJson` envelope helpers.
 */
import type { PostScreeningResponse } from "@/app/api/screening/[candidateId]/route";
import type { GetScreeningCandidatesResponse } from "@/app/api/screening/candidates/route";
import { getJson, postJson, type ApiResult } from "@/lib/api/client";
import type { SaveScreeningInput } from "@destaworks/contracts/validation/screening";

export function searchScreeningCandidates(
  search: string,
): Promise<ApiResult<GetScreeningCandidatesResponse>> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return getJson<GetScreeningCandidatesResponse>(`/api/screening/candidates${params}`);
}

export function postScreening(
  candidateId: string,
  input: SaveScreeningInput,
): Promise<ApiResult<PostScreeningResponse>> {
  return postJson<PostScreeningResponse>(`/api/screening/${candidateId}`, input);
}
