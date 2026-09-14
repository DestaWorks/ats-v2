import { describe, expect, it } from "vitest";
import { activeOrderAsOf } from "./stage-progress";

describe("activeOrderAsOf (the core Wave 5.2 fix)", () => {
  it("floors at 0 (New Candidate) for a candidate with no history rows yet, at or after createdAt", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const asOf = new Date("2026-01-05T00:00:00Z");
    expect(activeOrderAsOf({ createdAt }, new Map(), "c1", asOf)).toBe(0);
  });

  it("reaches nothing (-1) for a candidate created AFTER `asOf`", () => {
    const createdAt = new Date("2026-01-10T00:00:00Z");
    const asOf = new Date("2026-01-05T00:00:00Z");
    expect(activeOrderAsOf({ createdAt }, new Map(), "c1", asOf)).toBe(-1);
  });

  it(
    "a candidate later REJECTED still shows the highest ACTIVE stage they actually reached — " +
      "the history map is assumed pre-filtered to exclude terminal transitions (order >= 9), " +
      "which is what makes this safe: even if the map held a stray high value, the candidate's " +
      "real progress (Submitted, order 4) is what should win via max()",
    () => {
      const createdAt = new Date("2026-01-01T00:00:00Z");
      const asOf = new Date("2026-02-01T00:00:00Z");
      // Reached Submitted to Client (order 4) before being rejected — the repository excludes the
      // rejection transition itself (order 9+) from this map, so 4 is the true max active order.
      const historyMax = new Map([["c1", 4]]);
      expect(activeOrderAsOf({ createdAt }, historyMax, "c1", asOf)).toBe(4);
    },
  );

  it("takes the max of the history value and the New-Candidate floor", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const asOf = new Date("2026-02-01T00:00:00Z");
    const historyMax = new Map([["c1", 6]]);
    expect(activeOrderAsOf({ createdAt }, historyMax, "c1", asOf)).toBe(6);
  });
});
