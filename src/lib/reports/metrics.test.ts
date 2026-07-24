import { describe, expect, it } from "vitest";
import { average, median, percentile, timeToFillDays } from "./metrics";

describe("average", () => {
  it("averages, null on empty", () => {
    expect(average([1, 2, 3])).toBe(2);
    expect(average([])).toBeNull();
  });
});

describe("median", () => {
  it("odd/even lengths, null on empty", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("percentile", () => {
  it("nearest-rank p90, null on empty", () => {
    const values = Array.from({ length: 10 }, (_, i) => i + 1); // 1..10
    expect(percentile(values, 90)).toBe(9);
    expect(percentile(values, 100)).toBe(10);
    expect(percentile([], 90)).toBeNull();
  });
});

describe("timeToFillDays", () => {
  it("null when not placed; days between createdAt and placedAt otherwise", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    expect(timeToFillDays({ createdAt, placedAt: null })).toBeNull();
    expect(timeToFillDays({ createdAt, placedAt: new Date("2026-01-11T00:00:00Z") })).toBe(10);
  });
});
