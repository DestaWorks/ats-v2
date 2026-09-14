/**
 * Shared OFFSET-pagination helpers — every list service (candidates, leads, roles) was
 * hand-rolling the same `totalPages`/clamped-`page`/`hasPrev`/`hasNext` derivation, and every
 * list page's numbered-pager footer duplicated the same href-building + page-number-with-gaps
 * logic. Pure, isomorphic (no server/React import), so it's safe to share across services and
 * the client (see `components/ui/pager.tsx` for the rendered `<Pager>`).
 */
export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Clamp `requestedPage` to `[1, totalPages]` and derive the rest of the pager envelope. */
export function pageMeta(total: number, requestedPage: number, pageSize: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { total, page, pageSize, totalPages, hasPrev: page > 1, hasNext: page < totalPages };
}

/** Href for the current URL with `?page=N` swapped in (page 1 drops the param). */
export function pageHrefFor(pathname: string, searchParams: URLSearchParams, n: number): string {
  const p = new URLSearchParams(searchParams.toString());
  if (n <= 1) p.delete("page");
  else p.set("page", String(n));
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Page numbers to render, with `"gap"` markers where pages are elided (…). */
export function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = [1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total);
  const nums = [...new Set(wanted)].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}
