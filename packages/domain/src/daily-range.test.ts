import { describe, it, expect } from "vitest";
import {
  acceptsLogEntry,
  datesInWindow,
  isDateRange,
  previousWindow,
  rangeWindow,
} from "./daily-range";

describe("rangeWindow", () => {
  it("anchors a week to Monday–Sunday, not the last seven days", () => {
    // 2026-09-20 is a Sunday: the week it belongs to started on the 14th.
    expect(rangeWindow("week", "2026-09-20")).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });

  it("covers the whole calendar month", () => {
    expect(rangeWindow("month", "2026-09-20")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("gets February right in a leap year and a common year", () => {
    expect(rangeWindow("month", "2024-02-10").to).toBe("2024-02-29");
    expect(rangeWindow("month", "2026-02-10").to).toBe("2026-02-28");
    expect(rangeWindow("month", "2100-02-10").to).toBe("2100-02-28"); // century, not a leap year
    expect(rangeWindow("month", "2000-02-10").to).toBe("2000-02-29"); // divisible by 400
  });

  it("maps each month to its calendar quarter", () => {
    expect(rangeWindow("quarter", "2026-01-05")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(rangeWindow("quarter", "2026-09-20")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(rangeWindow("quarter", "2026-12-31")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });

  it("covers the calendar year", () => {
    expect(rangeWindow("year", "2026-09-20")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("is a single day for `day`", () => {
    expect(rangeWindow("day", "2026-09-20")).toEqual({ from: "2026-09-20", to: "2026-09-20" });
  });

  it("refuses anything that is not a date key", () => {
    expect(() => rangeWindow("day", "20-09-2026")).toThrow();
  });
});

describe("datesInWindow", () => {
  it("is inclusive of both ends", () => {
    expect(datesInWindow("2026-09-18", "2026-09-20")).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });

  it("spans a month boundary", () => {
    expect(datesInWindow("2026-08-30", "2026-09-02")).toHaveLength(4);
  });

  it("returns nothing for a reversed window rather than spinning", () => {
    expect(datesInWindow("2026-09-20", "2026-09-18")).toEqual([]);
  });

  it("stays bounded on a window wider than the ceiling", () => {
    expect(datesInWindow("2020-01-01", "2030-01-01").length).toBeLessThanOrEqual(400);
  });
});

describe("previousWindow", () => {
  it("is the same length, immediately before, with no overlap", () => {
    const prev = previousWindow("2026-09-14", "2026-09-20");
    expect(prev).toEqual({ from: "2026-09-07", to: "2026-09-13" });
    expect(datesInWindow(prev.from, prev.to)).toHaveLength(7);
  });
});

describe("range vocabulary", () => {
  it("only `day` accepts a log entry — you cannot log a quarter's numbers", () => {
    expect(acceptsLogEntry("day")).toBe(true);
    for (const r of ["week", "month", "quarter", "year"] as const) {
      expect(acceptsLogEntry(r)).toBe(false);
    }
  });

  it("rejects an unknown range", () => {
    expect(isDateRange("week")).toBe(true);
    expect(isDateRange("fortnight")).toBe(false);
  });
});
