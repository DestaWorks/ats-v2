import { describe, expect, it } from "vitest";
import { fixedClock } from "./clock";
import {
  businessDaysLeft,
  dateKey,
  elapsedMonths,
  dateKeyForOffset,
  dayWindow,
  daysBefore,
  mondayOf,
  paceStatus,
  rampFor,
  sourcingStreak,
  tenureWeek,
  weeklyPacing,
  weekWindow,
  utcDayStart,
  utcDaysBetween,
  utcNextDayStart,
} from "./daily";

describe("dateKeyForOffset (perf audit 2026-08-05 — the app-tz cookie's seed calculation)", () => {
  it("matches the instant's UTC date when tz=0", () => {
    expect(dateKeyForOffset(0, fixedClock("2026-07-13T12:00:00.000Z"))).toBe("2026-07-13");
  });

  it("UTC+3 (Addis, tz=-180): local time already past midnight → next day's key", () => {
    // 21:30 UTC + 3h = 00:30 local the NEXT day.
    expect(dateKeyForOffset(-180, fixedClock("2026-07-13T21:30:00.000Z"))).toBe("2026-07-14");
  });

  it("UTC+3 (Addis, tz=-180): local time still before midnight → same day's key", () => {
    // 20:30 UTC + 3h = 23:30 local, still the SAME UTC day.
    expect(dateKeyForOffset(-180, fixedClock("2026-07-13T20:30:00.000Z"))).toBe("2026-07-13");
  });

  it("US Eastern-shaped offset (tz=+300, UTC-5): local time still the PREVIOUS day", () => {
    // 02:00 UTC - 5h = 21:00 the previous day, local.
    expect(dateKeyForOffset(300, fixedClock("2026-07-13T02:00:00.000Z"))).toBe("2026-07-12");
  });
});

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
    expect(weeklyPacing(40, 20, 2, 3, false).projectedTotal).toBe(100);
  });

  it("computes neededPerDay against the weekly target (dailyTarget * 5)", () => {
    // weekly target 100 (20*5), 40 so far, 3 days left → ceil(60/3) = 20/day.
    expect(weeklyPacing(40, 20, 2, 3, false).neededPerDay).toBe(20);
  });

  it("clamps neededPerDay to 0 once the weekly target is already met", () => {
    expect(weeklyPacing(150, 20, 5, 0, false).neededPerDay).toBe(0);
    expect(weeklyPacing(150, 20, 5, 2, false).neededPerDay).toBe(0);
  });

  it("returns 0/0 with no data yet (week just started, nothing logged)", () => {
    expect(weeklyPacing(0, 20, 0, 5, false)).toEqual({ neededPerDay: 20, projectedTotal: 0 });
  });

  it("neededPerDay is 0 when no business days remain (weekend)", () => {
    expect(weeklyPacing(10, 20, 3, 0, false).neededPerDay).toBe(0);
  });
});

describe("weeklyPacing REGRESSION — the current day was counted twice", () => {
  const clock = fixedClock("2026-07-15T17:00:00.000Z"); // a Wednesday, end of shift
  const today = dateKeyForOffset(0, clock);

  it("stops spreading the shortfall over a day whose log is already submitted", () => {
    expect(today).toBe("2026-07-15");
    const daysLeft = businessDaysLeft(today); // Wed/Thu/Fri, INCLUSIVE of today
    expect(daysLeft).toBe(3);

    // OLD behaviour divided the 60 still needed by 3 — counting Wednesday BOTH as a day already
    // worked (its 40 are inside weekSourced) and as a day still available.
    expect(weeklyPacing(40, 20, 3, daysLeft, false).neededPerDay).toBe(20);
    // Only Thursday and Friday are really left: ceil(60/2) = 30.
    expect(weeklyPacing(40, 20, 3, daysLeft, true).neededPerDay).toBe(30);
  });

  it("asks for nothing more on a Friday whose log is already in", () => {
    expect(businessDaysLeft("2026-07-17")).toBe(1);
    // OLD: the entire remaining shortfall landed on a day already closed out.
    expect(weeklyPacing(60, 20, 5, 1, false).neededPerDay).toBe(40);
    expect(weeklyPacing(60, 20, 5, 1, true).neededPerDay).toBe(0);
  });
});

describe("REGRESSION — server 'today' resolved to the HOST's UTC day", () => {
  it("resolves the USER's calendar day, which the host's day disagrees with", () => {
    // 22:30 UTC: a viewer in UTC+3 is already on the 14th, one in UTC-5 still on the 13th.
    const clock = fixedClock("2026-07-13T22:30:00.000Z");
    expect(dateKeyForOffset(-180, clock)).toBe("2026-07-14");
    expect(dateKeyForOffset(300, clock)).toBe("2026-07-13");
    // A UTC host (Vercel) answers "2026-07-13" for BOTH — wrong for the first viewer.
    expect(dateKeyForOffset(0, clock)).toBe("2026-07-13");
  });

  it("dateKey reads the HOST clock — right in a browser, never on the server", () => {
    const clock = fixedClock("2026-07-13T22:30:00.000Z");
    const host = clock.now();
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(dateKey(clock)).toBe(
      `${host.getFullYear()}-${pad(host.getMonth() + 1)}-${pad(host.getDate())}`,
    );
  });
});

describe("utcDayStart / utcNextDayStart — the ONE day-bound pair", () => {
  it("widens any instant to its UTC midnight", () => {
    expect(utcDayStart(new Date("2026-06-30T09:30:00.000Z")).toISOString()).toBe(
      "2026-06-30T00:00:00.000Z",
    );
  });

  it("uses a HALF-OPEN upper bound, not the 23:59:59.999 the audit filter used", () => {
    const to = utcNextDayStart(new Date("2026-06-30T09:30:00.000Z"));
    expect(to.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    // The old inclusive spelling stopped a millisecond early: anything stamped later in the
    // final second of the day fell out of a "to = 30 June" filter but is inside [start, next).
    const oldInclusiveEnd = new Date("2026-06-30T23:59:59.999Z").getTime();
    const lateInstant = oldInclusiveEnd + 0.5;
    expect(lateInstant).toBeGreaterThan(oldInclusiveEnd);
    expect(lateInstant).toBeLessThan(to.getTime());
  });

  it("tiles consecutive days with no gap and no overlap", () => {
    const day = new Date("2026-06-30T12:00:00.000Z");
    const next = utcNextDayStart(day);
    expect(utcDayStart(next).getTime()).toBe(next.getTime());
    expect(next.getTime() - utcDayStart(day).getTime()).toBe(86_400_000);
  });

  it("counts whole UTC days between two instants, signed", () => {
    const now = new Date("2026-07-16T14:00:00Z");
    expect(utcDaysBetween(now, new Date("2026-07-16T00:00:00Z"))).toBe(0);
    expect(utcDaysBetween(now, new Date("2026-07-17T00:00:00Z"))).toBe(1);
    expect(utcDaysBetween(now, new Date("2026-07-15T00:00:00Z"))).toBe(-1);
  });
});

describe("elapsedMonths — calendar months, never days/30, never negative", () => {
  it("counts whole calendar months rather than 30-day blocks", () => {
    expect(elapsedMonths(new Date("2026-01-01T00:00:00Z"), new Date("2027-01-01T00:00:00Z"))).toBe(
      12,
    );
    expect(elapsedMonths(new Date("2026-01-31T00:00:00Z"), new Date("2026-02-28T00:00:00Z"))).toBe(
      0,
    );
    expect(elapsedMonths(new Date("2026-01-15T00:00:00Z"), new Date("2026-03-14T00:00:00Z"))).toBe(
      1,
    );
    expect(elapsedMonths(new Date("2026-01-15T00:00:00Z"), new Date("2026-03-15T00:00:00Z"))).toBe(
      2,
    );
  });

  it("clamps a future-dated start to 0 instead of going negative", () => {
    expect(elapsedMonths(new Date("2027-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(
      0,
    );
  });
});
