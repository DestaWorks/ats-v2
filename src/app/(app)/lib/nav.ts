/**
 * App-shell navigation model — a pure, isomorphic helper shared by the server layout (which builds
 * the capability-gated item list) and the client nav (which highlights the active item). Kept free
 * of React/`next` imports so the active-link logic is unit-testable in the node-only Vitest runner.
 */

export interface NavItem {
  href: string;
  label: string;
}

/**
 * The base nav (in display order). The capability-gated **Import** item is appended by the layout
 * only for viewers with `bulkImport` — it is intentionally NOT here, so an ungated render can never
 * surface it.
 */
export const BASE_NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/candidates/new", label: "Add candidate" },
  { href: "/candidates", label: "Candidates" },
  { href: "/resume", label: "Parse Résumé" },
];

/**
 * Which nav href is "active" for the current path — the LONGEST item that the path either equals or
 * sits under (`/foo/…`). Longest-match disambiguates overlapping prefixes: on `/candidates/new`
 * both `/candidates` and `/candidates/new` match, and the more specific `/candidates/new` wins; on
 * `/candidates/abc123` only `/candidates` matches (the detail page lives under the browse item).
 * Returns `null` when nothing matches (e.g. an `(app)` route with no nav entry).
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (best === null || href.length > best.length) best = href;
    }
  }
  return best;
}
