/**
 * Keyset (cursor) pagination codec — isomorphic (NO `server-only`), so the client can carry
 * `nextCursor` opaquely without decoding it, and the server can encode/decode the full sort tuple.
 *
 * A cursor encodes the WHOLE sort tuple so the tiebreak is deterministic:
 *   - `createdAt` sorts (desc/asc): tuple = `(createdAt, id)` — `createdAt` sorts, `id` (cuid) breaks ties.
 *   - `name` sort (asc): tuple = `(name, id)`.
 *
 * The opaque string is `base64url(JSON.stringify([sortValue, id]))`. `decodeCursor` returns `null`
 * on any malformed input (bad base64 / bad JSON / wrong shape) — the caller (service/route) maps
 * that to `AppError("BAD_REQUEST")`, so this stays a pure, throw-free codec.
 */

/**
 * The sort key a cursor walks. `createdAt`/`at` values are ISO timestamp strings; `name` value is
 * the raw name. `at` is the audit-log timestamp column (Wave 2.5 Activity Log).
 */
export type CursorKind = "createdAt" | "name" | "at";

/** DB-backed sort orders the candidate list/board support (all keyset-paginable). */
export type ListOrderBy = "createdAt_desc" | "createdAt_asc" | "name_asc";

/** The Activity Log sort order (Wave 2.5) — keyset `(at, id)` desc; kept separate from `ListOrderBy`. */
export type AuditListOrderBy = "at_desc";

/** Any keyset-paginable sort order the codec understands. */
export type AnyOrderBy = ListOrderBy | AuditListOrderBy;

/** A decoded cursor — the sort value (as a string) plus the deterministic `id` tiebreak. */
export interface PageCursor {
  kind: CursorKind;
  /** ISO timestamp for `createdAt`/`at` kinds, the raw name for the `name` kind. */
  value: string;
  id: string;
}

/** Which sort key an `orderBy` walks (`name_asc` → name, `at_desc` → at, everything else → createdAt). */
export function orderByKind(orderBy: AnyOrderBy): CursorKind {
  if (orderBy === "at_desc") return "at";
  return orderBy === "name_asc" ? "name" : "createdAt";
}

/**
 * The minimal row shape a cursor is built from. A candidate row (`createdAt`/`name`) and an
 * `activity_log` row (`at`) both satisfy this; `encodeCursor` reads only the field the `orderBy`
 * selects, so the others are optional.
 */
export interface CursorSource {
  id: string;
  createdAt?: Date;
  name?: string;
  at?: Date;
}

function toBase64Url(s: string): string {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(s, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return typeof Buffer !== "undefined"
    ? Buffer.from(b64, "base64").toString("utf8")
    : decodeURIComponent(escape(atob(b64)));
}

/** Encode a row into an opaque cursor for the given sort order. */
export function encodeCursor(row: CursorSource, orderBy: AnyOrderBy): string {
  const kind = orderByKind(orderBy);
  const value =
    kind === "name"
      ? row.name!
      : kind === "at"
        ? row.at!.toISOString()
        : row.createdAt!.toISOString();
  return toBase64Url(JSON.stringify([value, row.id]));
}

/** Decode an opaque cursor for the given sort order, or `null` if it is malformed. */
export function decodeCursor(cursor: string, orderBy: AnyOrderBy): PageCursor | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(cursor));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [value, id] = parsed;
    if (typeof value !== "string" || typeof id !== "string" || id.length === 0) return null;
    const kind = orderByKind(orderBy);
    // For timestamp kinds the value must parse to a real date, or the keyset predicate is garbage.
    if ((kind === "createdAt" || kind === "at") && Number.isNaN(Date.parse(value))) return null;
    return { kind, value, id };
  } catch {
    return null;
  }
}
