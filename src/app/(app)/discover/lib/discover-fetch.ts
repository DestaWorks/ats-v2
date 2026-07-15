/**
 * Client fetch helper for Discover (Wave 2.7) — a thin wrapper over the gated `POST
 * /api/discover/add` route reusing the shared `postJson` envelope helper from `@/lib/api/client`.
 */
import { postJson, type ApiResult } from "@/lib/api/client";
import type { DiscoverAddRow } from "@/lib/validation/discover";

export function postDiscoverAdd(
  rows: DiscoverAddRow[],
  clientId: string | null,
): Promise<ApiResult<{ added: number; skipped: number }>> {
  return postJson("/api/discover/add", { rows, clientId: clientId || undefined });
}
