/**
 * Client fetch helpers for the `/activity` view — through `lib/api/client`, like every other
 * browser call, so the envelope is read in one place. Thin wrappers over the `viewAudit`-gated routes:
 * `GET /api/activity` (load-more keyset pages, carrying the current URL filters + cursor) and
 * `GET /api/activity/[id]` (the on-demand before/after detail for an expanded row). No PII crosses
 * the list hop — the list DTO omits the raw snapshots (AL-3); the detail hop is fetched only on
 * expand, by a `viewAudit` holder.
 */
import type { GetActivityResponse } from "@/app/api/activity/route";
import type { GetActivityDetailResponse } from "@/app/api/activity/[id]/route";
import { getJson, messageForFailure } from "@/lib/api/client";
import { buildActivityQuery } from "./activity-query";

/** Fetch the next keyset page for the current filters. Throws on a non-OK response. */
export async function fetchActivityPage(
  searchParams: URLSearchParams,
  cursor: string,
): Promise<GetActivityResponse> {
  const query = buildActivityQuery(searchParams, cursor);
  const result = await getJson<GetActivityResponse>(`/api/activity?${query}`);
  if (!result.ok) throw new Error(messageForFailure(result.failure));
  return result.data;
}

/** Fetch one row's before/after snapshots (the expander detail). Throws on a non-OK response. */
export async function fetchActivityDetail(id: string): Promise<GetActivityDetailResponse> {
  const result = await getJson<GetActivityDetailResponse>(
    `/api/activity/${encodeURIComponent(id)}`,
  );
  if (!result.ok) throw new Error(messageForFailure(result.failure));
  return result.data;
}
