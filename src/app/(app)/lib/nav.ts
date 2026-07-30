/**
 * App-shell navigation model — a pure, isomorphic helper shared by the server layout (which builds
 * the capability-gated item list) and the client nav (which highlights the active item). Kept free
 * of React/`next` imports so the active-link logic is unit-testable in the node-only Vitest runner.
 */

/**
 * Icon key per nav item — a plain string, not a component, so this file stays framework-agnostic
 * (see file docstring). The client `AppNav` maps each key to an actual Heroicons component; the
 * union below is the single source of truth for which keys are valid.
 */
export type NavIconKey =
  | "home"
  | "clipboard"
  | "sun"
  | "calendar"
  | "search"
  | "sparkles"
  | "board"
  | "check"
  | "shield"
  | "users"
  | "briefcase"
  | "documents"
  | "academic"
  | "profile"
  | "upload"
  | "clock"
  | "id"
  | "building"
  | "chart"
  | "trending"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  /** Section header this item renders under (e.g. "Recruiting"). Omitted → renders as a plain,
   *  headerless link in its array position (used for anchors like Overview/My Profile/Admin that
   *  shouldn't live inside a collapsible section). */
  group?: string;
  icon?: NavIconKey;
}

/**
 * The base nav (in display order). The capability-gated items (**Import**, **Activity**,
 * **Credentials**, **CRM**, **Reports**, **Analytics**, **Admin**) are appended by the layout only
 * for viewers with the matching capability — intentionally NOT here, so an ungated render can never
 * surface them. Each carries a `group` so `groupNavItems` buckets it under the right section
 * regardless of where in the array it lands (see `layout.tsx`). **Trash is deliberately NOT a nav
 * item** (2026-07-28) — the page/feature (soft-delete list + restore + capability-gated purge)
 * still exists at `/trash` and is fully functional, it's just not linked from the sidebar; reachable
 * via direct URL or a future in-context "restore" link.
 */
export const BASE_NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "home" },

  { href: "/daily-log", label: "Daily Log", group: "Home", icon: "clipboard" },
  { href: "/daily-brief", label: "Daily Brief", group: "Home", icon: "sun" },
  { href: "/weekly-brief", label: "Weekly Brief", group: "Home", icon: "calendar" },

  { href: "/sourcing", label: "Sourcing", group: "Recruiting", icon: "search" },
  { href: "/discover", label: "Discover", group: "Recruiting", icon: "sparkles" },
  { href: "/pipeline", label: "Pipeline", group: "Recruiting", icon: "board" },
  { href: "/screening", label: "Screening", group: "Recruiting", icon: "check" },
  { href: "/license-verify", label: "License Verify", group: "Recruiting", icon: "shield" },
  { href: "/candidates", label: "Candidates", group: "Recruiting", icon: "users" },
  { href: "/roles", label: "Open Roles", group: "Recruiting", icon: "briefcase" },

  { href: "/templates", label: "Templates", group: "Tools", icon: "documents" },
  { href: "/learn", label: "Learn", group: "Tools", icon: "academic" },

  { href: "/profile", label: "My Profile", icon: "profile" },
];

/** One rendered sidebar section — `group: null` is a headerless anchor item (Overview, My Profile,
 *  Admin, …), always rendered as its own single-item "section". */
export interface NavSection {
  group: string | null;
  items: NavItem[];
}

/**
 * Bucket nav items into sections by `group`, preserving each group's FIRST-occurrence position —
 * so a capability-gated item appended later in the array (e.g. layout.tsx pushes "Import" after
 * "My Profile") still lands under its section header at the header's natural position, not
 * wherever it happens to be pushed. Items with no `group` each render as their own headerless
 * section, in place.
 */
export function groupNavItems(items: readonly NavItem[]): NavSection[] {
  const sections: NavSection[] = [];
  const byGroup = new Map<string, NavSection>();
  for (const item of items) {
    if (!item.group) {
      sections.push({ group: null, items: [item] });
      continue;
    }
    let section = byGroup.get(item.group);
    if (!section) {
      section = { group: item.group, items: [] };
      byGroup.set(item.group, section);
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

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
