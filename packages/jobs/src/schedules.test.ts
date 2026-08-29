import { describe, expect, it } from "vitest";
import { EXAMPLE_DAILY_EXPORT_SCHEDULE, SCHEDULES } from "./schedules";

/**
 * The registry's emptiness is a DECISION, not an oversight — see the module doc. This asserts it
 * so that adding the first real schedule is a deliberate act with a test to update, and so the
 * worked example cannot drift into the live list by a stray import.
 */
describe("the schedule registry", () => {
  it("registers nothing yet — Phase 5 ships the mechanism, not invented recurring jobs", () => {
    expect(SCHEDULES).toHaveLength(0);
  });

  it("does not include the worked example", () => {
    expect(SCHEDULES).not.toContain(EXAMPLE_DAILY_EXPORT_SCHEDULE);
  });

  it("states a real time zone on the example, never a bare hour", () => {
    expect(EXAMPLE_DAILY_EXPORT_SCHEDULE.timeZone).toBe("Africa/Addis_Ababa");
    expect(EXAMPLE_DAILY_EXPORT_SCHEDULE.at).toEqual({ hour: 6, minute: 0 });
  });

  it("keeps schedule names unique — the name is half the claim key", () => {
    const names = SCHEDULES.map((schedule) => schedule.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
