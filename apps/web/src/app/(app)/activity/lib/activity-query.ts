/**
 * Pure, isomorphic helpers for the `/activity` (Activity Log) client view. No React, no server
 * imports — unit-tested in isolation (Vitest node). Two concerns:
 *
 * - `buildActivityQuery` — assembles the load-more query string for `GET /api/activity` from the
 *   current URL `searchParams` (the URL-synced filter bar) plus the opaque keyset `cursor`, dropping
 *   empties so the next page matches exactly what the user is looking at.
 * - `diffChangedKeys` / `formatActivityValue` — the changed-keys diff the row expander renders from a
 *   row's `before`/`after` snapshots (AL-7): the keys whose values differ, plus a plain-text
 *   rendering of each value. Values are formatted as escaped text by React; nothing here emits HTML.
 */

/**
 * The server-backed filter params carried into a load-more request. `cursor` is appended separately.
 * Mirrors the `activityQuerySchema` filter fields (sans `cursor`).
 */
export const ACTIVITY_FILTER_PARAMS = ["action", "entity", "actor", "from", "to"] as const;

/**
 * Assemble the load-more query string for `GET /api/activity` — carries the current filter params
 * from the page URL plus the opaque keyset `cursor`. Empty values are dropped. Returns a bare query
 * string (no leading `?`).
 */
export function buildActivityQuery(searchParams: URLSearchParams, cursor: string | null): string {
  const out = new URLSearchParams();
  for (const key of ACTIVITY_FILTER_PARAMS) {
    const value = searchParams.get(key);
    if (value) out.set(key, value);
  }
  if (cursor) out.set("cursor", cursor);
  return out.toString();
}

/** One changed field in a before/after diff. `before`/`after` are raw snapshot values. */
export interface ChangedKey {
  key: string;
  before: unknown;
  after: unknown;
}

/** Coerce a snapshot to a plain record (arrays/primitives/null → an empty record — nothing to key). */
function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Order-insensitive structural stringify (sorts object keys) so key-reordering isn't a false diff. */
function stableStringify(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const record = val as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = record[k];
          return acc;
        }, {});
    }
    return val;
  });
}

/** Deep value equality via a stable structural stringify (handles nested objects/arrays). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return stableStringify(a) === stableStringify(b);
}

/**
 * The changed-keys diff the expander renders (AL-7): for the union of keys across the `before` and
 * `after` snapshots, the keys whose values differ, each with its `before`/`after` value (a
 * removed/added key surfaces as `undefined` on the missing side). Keys are returned sorted for a
 * stable render. Non-object snapshots (null/array/primitive) contribute no keys.
 */
export function diffChangedKeys(before: unknown, after: unknown): ChangedKey[] {
  const b = toRecord(before);
  const a = toRecord(after);
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  const out: ChangedKey[] = [];
  for (const key of keys) {
    if (!valuesEqual(b[key], a[key])) {
      out.push({ key, before: b[key], after: a[key] });
    }
  }
  return out;
}

/**
 * Render a snapshot value as plain, human-readable text for the diff table. `undefined` (an
 * absent key) reads as an em-dash; `null` is explicit; strings pass through; everything else is
 * JSON-stringified. Never emits HTML — the caller renders the returned string as escaped text.
 */
export function formatActivityValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
