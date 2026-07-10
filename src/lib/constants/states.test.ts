import { describe, it, expect } from "vitest";
import { COMPACT_STATES, STATE_BOARDS, isCompactState, stateBoardLink } from "./states";

describe("states", () => {
  it("recognizes NLC compact states (ported list of 37)", () => {
    expect(COMPACT_STATES).toHaveLength(37);
    expect(isCompactState("TX")).toBe(true);
    expect(isCompactState("FL")).toBe(true);
    expect(isCompactState("CT")).toBe(true);
  });

  it("rejects non-compact and empty states", () => {
    expect(isCompactState("CA")).toBe(false); // California is not NLC
    expect(isCompactState("NY")).toBe(false);
    expect(isCompactState("")).toBe(false);
    expect(isCompactState(null)).toBe(false);
    expect(isCompactState(undefined)).toBe(false);
  });
});

describe("stateBoardLink", () => {
  it("returns the named portal for the 4 mapped states (URLs refreshed 2026-07-10)", () => {
    expect(Object.keys(STATE_BOARDS)).toEqual(["CT", "NJ", "FL", "MA"]);
    expect(stateBoardLink("CT")).toEqual({
      name: "CT eLicense Portal",
      url: "https://www.elicense.ct.gov/",
      mapped: true,
    });
    // NJ must point at the VERIFICATION search, not the portal shell root (link rot 2026-07).
    expect(stateBoardLink("NJ")?.url).toBe("https://newjersey.mylicense.com/verification/");
    expect(stateBoardLink("MA")?.url).toBe("https://checkahealthlicense.mass.gov/");
    expect(stateBoardLink("FL")?.url).toBe("https://flhealthsource.gov/");
  });

  it("falls back to a license-lookup search for unmapped states", () => {
    const link = stateBoardLink("NY");
    expect(link?.mapped).toBe(false);
    expect(link?.url).toContain("google.com/search");
    expect(link?.url).toContain("NY");
  });

  it("returns null when there is no license state", () => {
    expect(stateBoardLink(null)).toBeNull();
    expect(stateBoardLink(undefined)).toBeNull();
    expect(stateBoardLink("")).toBeNull();
  });
});
