/**
 * Pure, isomorphic helpers for the `/candidates` browse list's client-side pagination + page-local
 * toggles. No React, no server imports — unit-tested in isolation (Vitest node). The list paginates
 * by a DB field (Newest/Oldest) server-side; these cover only the client concerns: assembling the
 * load-more query from the URL, appending/deduping pages, and the two PAGE-LOCAL toggles (fit sort +
 * hot filter) that reorder/filter ONLY the already-loaded rows (never a server re-query).
 */
import { HOT_SCORE } from "@/lib/constants";

/** Anything carrying a fit score — both the list item and the board card satisfy this. */
interface Scored {
  score: number | null;
}

/**
 * The server-backed filter/sort params carried into a load-more request. Page-local toggles
 * (`hot`/`fit`) are deliberately absent — they are resolved on the client, never sent.
 */
export const LIST_SERVER_PARAMS = [
  "track",
  "clientId",
  "status",
  "search",
  "tags",
  "licenseStatus",
  "mine",
  "overdue",
  "stuck",
  "sort",
] as const;

/**
 * Page-local "Sort by fit (this page)" — reorders the LOADED rows by score desc, nulls last. Pure
 * (returns a new array). A `null` score means "nothing to score against", so it always sinks below
 * any real score (including a real `0`). Stable-ish: equal scores keep their relative input order.
 */
export function sortByFitLocal<T extends Scored>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const as = a.row.score;
      const bs = b.row.score;
      if (as === null && bs === null) return a.index - b.index;
      if (as === null) return 1;
      if (bs === null) return -1;
      if (bs !== as) return bs - as;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Page-local "Hot" filter — keeps only loaded rows whose score meets `HOT_SCORE` (nulls excluded). */
export function filterHotLocal<T extends Scored>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.score !== null && row.score >= HOT_SCORE);
}

/**
 * Append the next keyset page to the accumulated rows, deduping by `id` (a concurrent insert/move
 * between page loads can, in rare cases, surface a row already shown — keyset makes this rare, not
 * impossible). First occurrence wins; input order is preserved.
 */
export function mergePage<T extends { id: string }>(
  existing: readonly T[],
  next: readonly T[],
): T[] {
  const seen = new Set(existing.map((row) => row.id));
  const merged: T[] = existing.slice();
  for (const row of next) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/**
 * Assemble the load-more query string for `GET /api/candidates/list` — carries the current server
 * filters + sort from the page URL (so the next page matches what the user is looking at) plus the
 * opaque keyset `cursor`. Page-local toggles are intentionally not forwarded. Returns a bare query
 * string (no leading `?`).
 */
export function buildListQuery(searchParams: URLSearchParams, cursor: string | null): string {
  const out = new URLSearchParams();
  for (const key of LIST_SERVER_PARAMS) {
    const value = searchParams.get(key);
    if (value) out.set(key, value);
  }
  if (cursor) out.set("cursor", cursor);
  return out.toString();
}
