import { describe, it, expect } from "vitest";
import { activeNavHref, BASE_NAV_ITEMS } from "./nav";

const HREFS = BASE_NAV_ITEMS.map((i) => i.href);

describe("activeNavHref", () => {
  it("matches an exact path", () => {
    expect(activeNavHref("/dashboard", HREFS)).toBe("/dashboard");
    expect(activeNavHref("/pipeline", HREFS)).toBe("/pipeline");
    expect(activeNavHref("/candidates", HREFS)).toBe("/candidates");
  });

  it("prefers the LONGEST match so /candidates/new beats /candidates", () => {
    expect(activeNavHref("/candidates/new", HREFS)).toBe("/candidates/new");
  });

  it("keeps a nested detail path under its browse item", () => {
    expect(activeNavHref("/candidates/abc123", HREFS)).toBe("/candidates");
  });

  it("matches the capability-gated Import item when present", () => {
    const withImport = [...HREFS, "/migration"];
    expect(activeNavHref("/migration", withImport)).toBe("/migration");
  });

  it("returns null when no item matches", () => {
    expect(activeNavHref("/settings", HREFS)).toBeNull();
  });

  it("does not treat a sibling prefix as a match (/candidates ≠ /candidatesX)", () => {
    expect(activeNavHref("/candidatesX", HREFS)).toBeNull();
  });
});
