/**
 * Client fetch helper for Smarter Sourcing (Wave 3.2) — a thin wrapper over `POST
 * /api/sourcing/similar`, reusing the shared `postJson` envelope helper from `@/lib/api/client`.
 */
import { postJson, type ApiResult } from "@/lib/api/client";
import type { FindSimilarResultDTO } from "@/lib/validation/similarity";

export function postFindSimilar(
  credential: string | null,
  state: string | null,
): Promise<ApiResult<FindSimilarResultDTO>> {
  return postJson("/api/sourcing/similar", { credential, state });
}
