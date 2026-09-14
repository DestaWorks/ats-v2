import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fixedClock } from "@destaworks/domain/clock";
import type { JobDefinition } from "./queue";
import { dailySchedule, occurrenceKey, previousOccurrence } from "./schedule";

/**
 * The timezone half of the scheduler. These are the assertions that would have caught the Phase
 * 0.6 bug in its scheduled form: a "daily at 6am" job whose 6am was really the host's.
 */

const noopJob: JobDefinition<unknown> = {
  name: "test.noop",
  schema: z.unknown(),
  maxAttempts: 1,
  timeoutMs: 1_000,
};

function at6am(timeZone: string) {
  return dailySchedule({
    name: `test.${timeZone}`,
    at: { hour: 6, minute: 0 },
    timeZone,
    job: noopJob,
    payload: undefined,
  });
}

describe("previousOccurrence — whose 6am", () => {
  it("resolves 06:00 Addis Ababa (UTC+3) to 03:00Z, not to 06:00Z", () => {
    const schedule = at6am("Africa/Addis_Ababa");
    const now = fixedClock("2026-03-10T12:00:00Z").now();
    expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("would have been six hours late had the host's UTC day been used instead", () => {
    // The bug this guards: 06:00 in the schedule's zone is NOT 06:00Z. If the two ever agree for
    // a zone that is not UTC, the zone has stopped being applied.
    const schedule = at6am("Africa/Addis_Ababa");
    const now = fixedClock("2026-03-10T12:00:00Z").now();
    expect(previousOccurrence(schedule, now).getUTCHours()).not.toBe(6);
  });

  describe("the boundary hour", () => {
    const schedule = at6am("Africa/Addis_Ababa");

    it("one millisecond before due, the last occurrence is YESTERDAY's", () => {
      const now = fixedClock("2026-03-10T02:59:59.999Z").now();
      expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-03-09T03:00:00.000Z");
    });

    it("exactly at the due instant, the occurrence is TODAY's", () => {
      const now = fixedClock("2026-03-10T03:00:00.000Z").now();
      expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-03-10T03:00:00.000Z");
    });

    it("still today's an hour later — the same occurrence, not a new one", () => {
      const now = fixedClock("2026-03-10T04:00:00.000Z").now();
      expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-03-10T03:00:00.000Z");
    });
  });

  it("rolls back across a month boundary, not by subtracting 24 hours from a UTC day", () => {
    const schedule = at6am("Africa/Addis_Ababa");
    const now = fixedClock("2026-04-01T02:00:00Z").now(); // 05:00 local on the 1st, before 06:00
    expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-03-31T03:00:00.000Z");
  });
});

describe("previousOccurrence — daylight saving", () => {
  const schedule = at6am("America/New_York");

  it("is 11:00Z in winter (EST, UTC-5)", () => {
    const now = fixedClock("2026-01-15T18:00:00Z").now();
    expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("is 10:00Z in summer (EDT, UTC-4) — a fixed offset would be an hour wrong", () => {
    const now = fixedClock("2026-07-15T18:00:00Z").now();
    expect(previousOccurrence(schedule, now).toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("straddles the spring-forward day correctly (2026-03-08, 02:00 -> 03:00 local)", () => {
    // Just before 06:00 EDT on the transition day: the previous occurrence is the day before,
    // which was still EST — 23 hours earlier in wall-clock terms, but 11:00Z either way.
    const beforeDue = fixedClock("2026-03-08T09:59:00Z").now();
    expect(previousOccurrence(schedule, beforeDue).toISOString()).toBe("2026-03-07T11:00:00.000Z");
    const afterDue = fixedClock("2026-03-08T10:30:00Z").now();
    expect(previousOccurrence(schedule, afterDue).toISOString()).toBe("2026-03-08T10:00:00.000Z");
  });
});

describe("dailySchedule validation", () => {
  it("refuses an out-of-range time rather than firing at a surprising hour", () => {
    expect(() =>
      dailySchedule({
        name: "bad",
        at: { hour: 24, minute: 0 },
        timeZone: "UTC",
        job: noopJob,
        payload: undefined,
      }),
    ).toThrow(RangeError);
  });

  it("refuses an unknown time zone at definition time, not at 6am", () => {
    expect(() =>
      dailySchedule({
        name: "bad-zone",
        at: { hour: 6, minute: 0 },
        timeZone: "Mars/Olympus_Mons",
        job: noopJob,
        payload: undefined,
      }),
    ).toThrow();
  });
});

describe("occurrenceKey", () => {
  it("is the same string for the same occurrence, whichever worker builds it", () => {
    const occurrence = new Date("2026-03-10T03:00:00.000Z");
    expect(occurrenceKey("daily", occurrence)).toBe(occurrenceKey("daily", new Date(occurrence)));
  });

  it("distinguishes consecutive occurrences of the same schedule", () => {
    expect(occurrenceKey("daily", new Date("2026-03-10T03:00:00Z"))).not.toBe(
      occurrenceKey("daily", new Date("2026-03-11T03:00:00Z")),
    );
  });
});
