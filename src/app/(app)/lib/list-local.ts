/**
 * Pure, isomorphic helpers for CLIENT-side keyset lists that accumulate pages (the pipeline board's
 * per-column "Load more"). No React, no server imports — unit-tested in isolation. The flat
 * `/candidates` browse list is now fully server-paginated and does NOT use these; the board still
 * stitches keyset pages on the client and applies a page-local "Hot" filter, so they live here.
 */
import { HOT_SCORE } from "@/lib/constants";

/** Anything carrying a fit score — both the list item and the board card satisfy this. */
interface Scored {
  score: number | null;
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
