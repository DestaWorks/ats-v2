/**
 * Client fetch helpers for Screening (Wave 3.3) — thin wrappers over the gated
 * `/api/screening/*` routes reusing the shared `getJson`/`postJson` envelope helpers.
 */
import { getJson, postJson, type ApiResult } from "@/lib/api/client";
import type {
  SaveScreeningInput,
  ScreeningCandidateDTO,
  ScreeningScorecardDTO,
} from "@/lib/validation/screening";

export function searchScreeningCandidates(
  search: string,
): Promise<ApiResult<{ candidates: ScreeningCandidateDTO[] }>> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return getJson(`/api/screening/candidates${params}`);
}

export function postScreening(
  candidateId: string,
  input: SaveScreeningInput,
): Promise<ApiResult<{ scorecard: ScreeningScorecardDTO }>> {
  return postJson(`/api/screening/${candidateId}`, input);
}
