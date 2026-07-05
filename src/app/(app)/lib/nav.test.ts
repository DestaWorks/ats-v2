import { describe, it, expect } from "vitest";
import { activeNavHref, BASE_NAV_ITEMS } from "./nav";

const HREFS = BASE_NAV_ITEMS.map((i) => i.href);

describe("activeNavHref", () => {
  it("matches an exact path", () => {
    expect(activeNavHref("/dashboard", HREFS)).toBe("/dashboard");
    expect(activeNavHref("/pipeline", HREFS)).toBe("/pipeline");
    expect(activeNavHref("/candidates", HREFS)).toBe("/candidates");
    expect(activeNavHref("/trash", HREFS)).toBe("/trash");
  });

  it("includes Trash as a base nav item (visible to all operators)", () => {
    expect(BASE_NAV_ITEMS.some((i) => i.href === "/trash" && i.label === "Trash")).toBe(true);
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

  it("returns null when no item matches", () => {
    expect(activeNavHref("/settings", HREFS)).toBeNull();
  });

  it("does not treat a sibling prefix as a match (/candidates ≠ /candidatesX)", () => {
    expect(activeNavHref("/candidatesX", HREFS)).toBeNull();
  });
});
