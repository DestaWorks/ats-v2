import { describe, expect, it } from "vitest";
import {
  businessDaysLeft,
  dayWindow,
  daysBefore,
  mondayOf,
  paceStatus,
  rampFor,
  sourcingStreak,
  tenureWeek,
  weeklyPacing,
  weekWindow,
} from "./daily";

describe("mondayOf (the ONE week anchor)", () => {
  it("maps every day of a week to its Monday — including Sunday (legacy's split anchor)", () => {
    expect(mondayOf("2026-07-13")).toBe("2026-07-13"); // a Monday maps to itself
    expect(mondayOf("2026-07-15")).toBe("2026-07-13"); // Wednesday
    expect(mondayOf("2026-07-19")).toBe("2026-07-13"); // Sunday belongs to the PRECEDING Monday
    expect(mondayOf("2026-07-20")).toBe("2026-07-20"); // next Monday starts the next week
  });
});

describe("dayWindow", () => {
  it("resolves the user-local day to a UTC instant window (tz = getTimezoneOffset)", () => {
    // UTC+3 (Addis): local midnight = 21:00 UTC the previous day.
    const w = dayWindow("2026-07-13", -180);
    expect(w.start.toISOString()).toBe("2026-07-12T21:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-07-13T21:00:00.000Z");
    // UTC exactly.
    const utc = dayWindow("2026-07-13", 0);
    expect(utc.start.toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });
});

describe("weekWindow (Wave 5.1 — the ONE week window for briefs)", () => {
  it("spans exactly 7 days from the Monday's local midnight", () => {
    const w = weekWindow("2026-07-13", -180); // Monday, UTC+3
    expect(w.start.toISOString()).toBe("2026-07-12T21:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-07-19T21:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(7 * 86_400_000);
  });
});

describe("paceStatus (9am–5pm linear ramp)", () => {
  it("hit ≥ target; on-pace ≥ expected-by-now; behind otherwise; no target = hit", () => {
    expect(paceStatus(10, 10, 12)).toBe("hit");
    expect(paceStatus(0, 0, 12)).toBe("hit"); // no target → always green
    // 1pm → 4/8 of the day → expected 5 of 10.
    expect(paceStatus(5, 10, 13)).toBe("on pace");
    expect(paceStatus(4, 10, 13)).toBe("behind");
    // Before 9am nothing is expected yet.
    expect(paceStatus(0, 10, 8)).toBe("on pace");
  });
});

describe("tenure ramp", () => {
  it("weekNum counts whole weeks from the user's start (1-based)", () => {
    const start = new Date("2026-07-01T00:00:00Z");
    expect(tenureWeek(start, "2026-07-01")).toBe(1);
    expect(tenureWeek(start, "2026-07-07")).toBe(1);
    expect(tenureWeek(start, "2026-07-08")).toBe(2);
    expect(tenureWeek(start, "2026-08-15")).toBe(7);
  });

  it("phases match the legacy ramp table", () => {
    expect(rampFor(1).sourced).toBe(15);
    expect(rampFor(3)).toMatchObject({ sourced: 20, outreach: 20 });
    expect(rampFor(9)).toMatchObject({ sourced: 30, submitted: 3 });
  });
});

describe("sourcingStreak", () => {
  it("counts consecutive prior days at/above target, breaking on a miss or a gap (14 cap)", () => {
    const logs = new Map([
      ["2026-07-12", 20], // yesterday: hit
      ["2026-07-11", 15], // hit (target 15)
      ["2026-07-10", 3], // miss → break
      ["2026-07-09", 30],
    ]);
    expect(sourcingStreak("2026-07-13", logs, 15)).toBe(2);
    expect(sourcingStreak("2026-07-13", new Map(), 15)).toBe(0); // gap immediately
  });
});

describe("daysBefore", () => {
  it("crosses month boundaries", () => {
    expect(daysBefore("2026-07-01", 1)).toBe("2026-06-30");
  });
});

describe("businessDaysLeft", () => {
  it("counts INCLUSIVE remaining weekdays, 0 on a weekend", () => {
    expect(businessDaysLeft("2026-07-13")).toBe(5); // Monday
    expect(businessDaysLeft("2026-07-15")).toBe(3); // Wednesday
    expect(businessDaysLeft("2026-07-17")).toBe(1); // Friday
    expect(businessDaysLeft("2026-07-18")).toBe(0); // Saturday
    expect(businessDaysLeft("2026-07-19")).toBe(0); // Sunday
  });
});

describe("weeklyPacing", () => {
  it("projects the rest of the week from the average sourced/day so far", () => {
    // 40 sourced over 2 logged days → avg 20/day * 5 = 100 projected.
    expect(weeklyPacing(40, 20, 2, 3).projectedTotal).toBe(100);
  });

  it("computes neededPerDay against the weekly target (dailyTarget * 5)", () => {
    // weekly target 100 (20*5), 40 so far, 3 days left → ceil(60/3) = 20/day.
    expect(weeklyPacing(40, 20, 2, 3).neededPerDay).toBe(20);
  });

  it("clamps neededPerDay to 0 once the weekly target is already met", () => {
    expect(weeklyPacing(150, 20, 5, 0).neededPerDay).toBe(0);
    expect(weeklyPacing(150, 20, 5, 2).neededPerDay).toBe(0);
  });

  it("returns 0/0 with no data yet (week just started, nothing logged)", () => {
    expect(weeklyPacing(0, 20, 0, 5)).toEqual({ neededPerDay: 20, projectedTotal: 0 });
  });

  it("neededPerDay is 0 when no business days remain (weekend)", () => {
    expect(weeklyPacing(10, 20, 3, 0).neededPerDay).toBe(0);
  });
});
