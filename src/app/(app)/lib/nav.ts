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
 * surface it. **Trash** is a base item: soft-delete/restore are open to every operator (the
 * separately capability-gated Purge action lives inside the page), so all operators see it.
 */
export const BASE_NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/sourcing", label: "Sourcing" },
  { href: "/candidates", label: "Candidates" },
  { href: "/resume", label: "Parse Résumé" },
  { href: "/trash", label: "Trash" },
];

/**
 * Which nav href is "active" for the current path — the LONGEST item that the path either equals or
 * sits under (`/foo/…`). Longest-match disambiguates overlapping prefixes when they exist; with the
 * base items, `/candidates/new` and `/candidates/abc123` both fall under the `/candidates` browse
 * item (the detail + add pages live under it — "Add candidate" is now a modal trigger, not a nav
 * destination). Returns `null` when nothing matches (e.g. an `(app)` route with no nav entry).
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
