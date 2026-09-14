import { describe, it, expect } from "vitest";
import { activeNavHref, BASE_NAV_ITEMS, groupNavItems, type NavItem } from "./nav";

const HREFS = BASE_NAV_ITEMS.map((i) => i.href);

describe("activeNavHref", () => {
  it("matches an exact path", () => {
    expect(activeNavHref("/dashboard", HREFS)).toBe("/dashboard");
    expect(activeNavHref("/pipeline", HREFS)).toBe("/pipeline");
    expect(activeNavHref("/sourcing", HREFS)).toBe("/sourcing");
    expect(activeNavHref("/discover", HREFS)).toBe("/discover");
    expect(activeNavHref("/screening", HREFS)).toBe("/screening");
    expect(activeNavHref("/license-verify", HREFS)).toBe("/license-verify");
    expect(activeNavHref("/candidates", HREFS)).toBe("/candidates");
  });

  it("does NOT include Trash as a base nav item (2026-07-28 — page still exists, not linked)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/trash")).toBe(false);
  });

  it("includes Sourcing as a base nav item (visible to all operators)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/sourcing" && i.label === "Sourcing")).toBe(true);
  });

  it("includes Discover as a base nav item (visible to all operators)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/discover" && i.label === "Discover")).toBe(true);
  });

  it("includes Screening as a base nav item (visible to all operators)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/screening" && i.label === "Screening")).toBe(
      true,
    );
  });

  it("includes License Verify as a base nav item (visible to all operators)", () => {
    expect(
      BASE_NAV_ITEMS.some((i) => i.href === "/license-verify" && i.label === "License Verify"),
    ).toBe(true);
  });

  it("includes Templates as a base nav item (visible to all operators)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/templates" && i.label === "Templates")).toBe(
      true,
    );
  });

  it("prefers the LONGEST match when prefixes overlap", () => {
    // The helper stays general even though the base items no longer overlap.
    const hrefs = ["/candidates", "/candidates/new"];
    expect(activeNavHref("/candidates/new", hrefs)).toBe("/candidates/new");
  });

  it("keeps nested paths under the /candidates browse item", () => {
    // Add-candidate is now a modal (no /candidates/new nav entry), so its route — and any
    // candidate detail route — resolves to the browse item.
    expect(activeNavHref("/candidates/abc123", HREFS)).toBe("/candidates");
    expect(activeNavHref("/candidates/new", HREFS)).toBe("/candidates");
  });

  it("matches the capability-gated Import item when present", () => {
    const withImport = [...HREFS, "/migration"];
    expect(activeNavHref("/migration", withImport)).toBe("/migration");
  });

  it("matches the capability-gated Activity item when present (layout-appended, not base)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/activity")).toBe(false);
    const withActivity = [...HREFS, "/activity"];
    expect(activeNavHref("/activity", withActivity)).toBe("/activity");
  });

  it("matches the capability-gated Credentials item when present (layout-appended, not base)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/credentials")).toBe(false);
    const withCredentials = [...HREFS, "/credentials"];
    expect(activeNavHref("/credentials", withCredentials)).toBe("/credentials");
  });

  it("returns null when no item matches", () => {
    expect(activeNavHref("/settings", HREFS)).toBeNull();
  });

  it("does not treat a sibling prefix as a match (/candidates ≠ /candidatesX)", () => {
    expect(activeNavHref("/candidatesX", HREFS)).toBeNull();
  });
});

describe("groupNavItems", () => {
  it("renders a headerless single-item section for items with no group", () => {
    const items: NavItem[] = [{ href: "/dashboard", label: "Overview" }];
    expect(groupNavItems(items)).toEqual([
      { group: null, items: [{ href: "/dashboard", label: "Overview" }] },
    ]);
  });

  it("buckets consecutive same-group items into one section", () => {
    const items: NavItem[] = [
      { href: "/a", label: "A", group: "Home" },
      { href: "/b", label: "B", group: "Home" },
    ];
    expect(groupNavItems(items)).toEqual([
      {
        group: "Home",
        items: [
          { href: "/a", label: "A", group: "Home" },
          { href: "/b", label: "B", group: "Home" },
        ],
      },
    ]);
  });

  it("merges a same-group item appended LATER in the array into the section at its first occurrence", () => {
    // Mirrors layout.tsx: capability-gated "Import" is pushed after the base array, but should
    // still land inside the "Recruiting" section, not form a second trailing "Recruiting" section.
    const items: NavItem[] = [
      { href: "/sourcing", label: "Sourcing", group: "Recruiting" },
      { href: "/profile", label: "My Profile" },
      { href: "/migration", label: "Import", group: "Recruiting" },
    ];
    expect(groupNavItems(items)).toEqual([
      {
        group: "Recruiting",
        items: [
          { href: "/sourcing", label: "Sourcing", group: "Recruiting" },
          { href: "/migration", label: "Import", group: "Recruiting" },
        ],
      },
      { group: null, items: [{ href: "/profile", label: "My Profile" }] },
    ]);
  });

  it("produces exactly one section per ungrouped item, in place, never merging separate ungrouped items", () => {
    const items: NavItem[] = [
      { href: "/dashboard", label: "Overview" },
      { href: "/a", label: "A", group: "Home" },
      { href: "/profile", label: "My Profile" },
    ];
    const sections = groupNavItems(items);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toEqual({ group: null, items: [items[0]] });
    expect(sections[2]).toEqual({ group: null, items: [items[2]] });
  });

  it("groups the real BASE_NAV_ITEMS into the expected sections", () => {
    const sections = groupNavItems(BASE_NAV_ITEMS);
    // Overview is ungrouped and first; Home/Recruiting/Tools follow. My Profile is NOT here — it
    // lives in the header's account menu now, not the sidebar (2026-07-31).
    expect(sections.map((s) => s.group)).toEqual([null, "Home", "Recruiting", "Tools"]);
    expect(sections[0]!.group).toBeNull();
    expect(sections[0]!.items[0]!.href).toBe("/dashboard");
    expect(sections.at(-1)!.group).toBe("Tools");
  });

  it("does NOT include My Profile as a base nav item (2026-07-31 — moved to the header account menu)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/profile")).toBe(false);
  });
});
