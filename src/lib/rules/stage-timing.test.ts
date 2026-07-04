import { describe, it, expect } from "vitest";
import { getDaysInStage, isOverdue, isStuck } from "./stage-timing";

// Fixed "now" so tests are deterministic (rules take `now` as a param — pure).
const NOW = new Date("2026-07-03T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("getDaysInStage", () => {
  it("counts whole days since the stage was entered", () => {
    expect(getDaysInStage(daysAgo(0), NOW)).toBe(0);
    expect(getDaysInStage(daysAgo(3), NOW)).toBe(3);
    expect(getDaysInStage(daysAgo(10), NOW)).toBe(10);
  });

  it("returns 0 for a missing timestamp", () => {
    expect(getDaysInStage(null, NOW)).toBe(0);
    expect(getDaysInStage(undefined, NOW)).toBe(0);
  });
});

describe("isOverdue", () => {
  it("is true once past the stage SLA (Qualified SLA = 2 days)", () => {
    expect(isOverdue("QUALIFIED_PRESCREEN", daysAgo(1), NOW)).toBe(false);
    expect(isOverdue("QUALIFIED_PRESCREEN", daysAgo(2), NOW)).toBe(true);
    expect(isOverdue("QUALIFIED_PRESCREEN", daysAgo(5), NOW)).toBe(true);
  });

  it("uses the Submitted SLA of 7 days", () => {
    expect(isOverdue("SUBMITTED_TO_CLIENT", daysAgo(6), NOW)).toBe(false);
    expect(isOverdue("SUBMITTED_TO_CLIENT", daysAgo(7), NOW)).toBe(true);
  });

  it("is never overdue for stages without an SLA (Started + terminals)", () => {
    expect(isOverdue("STARTED_DAY1", daysAgo(365), NOW)).toBe(false);
    expect(isOverdue("FUTURE_PIPELINE", daysAgo(365), NOW)).toBe(false);
    expect(isOverdue("NOT_QUALIFIED", daysAgo(365), NOW)).toBe(false);
  });

  it("is not overdue with a missing timestamp", () => {
    expect(isOverdue("NEW_CANDIDATE", null, NOW)).toBe(false);
  });
});

describe("isStuck", () => {
  it("is true after more than 7 days by default", () => {
    expect(isStuck(daysAgo(7), NOW)).toBe(false); // exactly 7 is not > 7
    expect(isStuck(daysAgo(8), NOW)).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(isStuck(daysAgo(3), NOW, 2)).toBe(true);
    expect(isStuck(daysAgo(2), NOW, 2)).toBe(false);
  });
});
