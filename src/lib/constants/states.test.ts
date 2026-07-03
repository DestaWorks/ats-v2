import { describe, it, expect } from "vitest";
import { COMPACT_STATES, isCompactState } from "./states";

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
