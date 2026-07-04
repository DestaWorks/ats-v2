/**
 * Client fetch helper for the `/candidates` browse list's load-more. Thin wrapper over the gated
 * `GET /api/candidates/list` route; carries the current URL filters + sort + keyset cursor (assembled
 * by `buildListQuery`) and returns the next `CandidateListDTO` page. No PII crosses this — the list
 * DTO is already PII-gated server-side (`toListItem` omits `licenseNumber`).
 */
import type { CandidateListDTO } from "@/lib/validation/candidate";
import { buildListQuery } from "./list-pagination";

/** Fetch the next keyset page for the current filters/sort. Throws on a non-OK response. */
export async function fetchListPage(
  searchParams: URLSearchParams,
  cursor: string,
): Promise<CandidateListDTO> {
  const query = buildListQuery(searchParams, cursor);
  const res = await fetch(`/api/candidates/list?${query}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Failed to load more candidates.");
  return (await res.json()) as CandidateListDTO;
}
