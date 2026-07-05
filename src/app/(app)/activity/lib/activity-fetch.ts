/**
 * Client fetch helpers for the `/activity` view. Thin wrappers over the `viewAudit`-gated API routes:
 * `GET /api/activity` (load-more keyset pages, carrying the current URL filters + cursor) and
 * `GET /api/activity/[id]` (the on-demand before/after detail for an expanded row). No PII crosses
 * the list hop — the list DTO omits the raw snapshots (AL-3); the detail hop is fetched only on
 * expand, by a `viewAudit` holder.
 */
import type { ActivityDetailDTO, ActivityListDTO } from "@/lib/validation/activity";
import { buildActivityQuery } from "./activity-query";

/** Fetch the next keyset page for the current filters. Throws on a non-OK response. */
export async function fetchActivityPage(
  searchParams: URLSearchParams,
  cursor: string,
): Promise<ActivityListDTO> {
  const query = buildActivityQuery(searchParams, cursor);
  const res = await fetch(`/api/activity?${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to load more activity.");
  return (await res.json()) as ActivityListDTO;
}

/** Fetch one row's before/after snapshots (the expander detail). Throws on a non-OK response. */
export async function fetchActivityDetail(id: string): Promise<ActivityDetailDTO> {
  const res = await fetch(`/api/activity/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to load activity detail.");
  return (await res.json()) as ActivityDetailDTO;
}
