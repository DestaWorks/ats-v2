/**
 * One reader for the `searchParams` a list page is handed.
 *
 * Every browse page used to re-declare the same `one()`/`flag()`/page-number/date coercions inline,
 * which is how `/candidates` and `/roles` ended up disagreeing about what `?page=` means. The
 * coercions live here once; a page states only WHICH params it takes and what their vocabulary is.
 *
 * It composes with `query()` in `./api/server` rather than duplicating it: this half turns an
 * inbound URL into typed values, `query()` turns those values back into the outbound API query
 * string, and neither knows about the other's rules.
 *
 * No `server-only` — the same first-value/csv/url coercions are what a client list component needs
 * when it builds sort and pager hrefs from the params the RSC handed it.
 */

/** The shape Next.js hands a page: repeated params arrive as arrays. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The first value of a param — a repeated `?a=1&a=2` reads as `1`, matching every list endpoint. */
export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Split a comma-separated param into trimmed, non-empty members. */
export function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A 1-based page number; anything not a positive integer falls back to page 1. */
export function pageNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** A remount key over the coerced SERVER filters, so a client list re-seeds when the query changes. */
export function filterKey(...parts: (string | number | boolean | undefined)[]): string {
  return parts.join("|");
}

/** The current params as a mutable `URLSearchParams`, keeping first values and dropping empties. */
export function toUrlSearchParams(raw: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const v = firstValue(value);
    if (v) params.set(key, v);
  }
  return params;
}

export interface SearchParamReader {
  /** The untouched params, for a client child that builds its own hrefs. */
  readonly raw: RawSearchParams;
  /** Verbatim first value — `""` stays `""` (`query()` drops it), absent stays `undefined`. */
  str(key: string): string | undefined;
  /** Trimmed first value; blank or whitespace-only reads as absent. */
  text(key: string): string | undefined;
  /** A checkbox param this app writes as `1`. */
  flag(key: string): boolean;
  /** As `flag`, also honouring `true` — for the params legacy links spell out. */
  flagLoose(key: string): boolean;
  /** A 1-based page number, defaulting to 1. */
  page(key?: string): number;
  /** The value when it is one of `allowed`, else absent. */
  oneOf<T extends string>(key: string, allowed: readonly T[]): T | undefined;
  /** The value when a domain type guard accepts it, else absent. */
  guarded<T extends string>(key: string, isMember: (value: string) => value is T): T | undefined;
  /** A parseable date, else absent — an unreadable bound widens rather than refuses. */
  date(key: string): Date | undefined;
  /** A comma-separated list, or absent when the param is missing or blank. */
  csv(key: string): string[] | undefined;
}

export function readSearchParams(raw: RawSearchParams): SearchParamReader {
  const at = (key: string) => firstValue(raw[key]);

  return {
    raw,
    str: at,
    text: (key) => at(key)?.trim() || undefined,
    flag: (key) => at(key) === "1",
    flagLoose: (key) => {
      const value = at(key);
      return value === "1" || value === "true";
    },
    page: (key = "page") => pageNumber(at(key)),
    oneOf: <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
      const value = at(key);
      if (!value) return undefined;
      return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
    },
    guarded: <T extends string>(
      key: string,
      isMember: (value: string) => value is T,
    ): T | undefined => {
      const value = at(key);
      return value !== undefined && value !== "" && isMember(value) ? value : undefined;
    },
    date: (key) => {
      const value = at(key);
      if (!value) return undefined;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    },
    csv: (key) => {
      const value = at(key);
      return value ? splitCsv(value) : undefined;
    },
  };
}
