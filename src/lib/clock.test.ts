import { describe, it, expect } from "vitest";
import { advanceableClock, fixedClock, MS_PER_DAY, systemClock, type Clock } from "./clock";

describe("systemClock", () => {
  it("reads the real clock and hands back a fresh Date each call", () => {
    const before = Date.now();
    const a = systemClock.now();
    const b = systemClock.now();
    expect(a.getTime()).toBeGreaterThanOrEqual(before);
    expect(a).not.toBe(b); // never leaks a shared mutable Date
  });
});

describe("fixedClock", () => {
  it("returns the same instant however many times it is read", () => {
    const clock = fixedClock("2026-07-13T22:30:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-07-13T22:30:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-07-13T22:30:00.000Z");
  });

  it("accepts a Date, an ISO string, or epoch millis", () => {
    const ms = Date.UTC(2026, 6, 13, 22, 30);
    expect(fixedClock(new Date(ms)).now().getTime()).toBe(ms);
    expect(fixedClock("2026-07-13T22:30:00.000Z").now().getTime()).toBe(ms);
    expect(fixedClock(ms).now().getTime()).toBe(ms);
  });

  it("hands back a defensive copy — mutating the result cannot move the clock", () => {
    const clock = fixedClock("2026-07-13T22:30:00.000Z");
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-07-13T22:30:00.000Z");
  });

  it("rejects an unparseable instant instead of silently reading Invalid Date", () => {
    expect(() => fixedClock("not-a-date")).toThrow(RangeError);
    expect(() => fixedClock(Number.NaN)).toThrow(RangeError);
  });
});

describe("advanceableClock", () => {
  it("steps forward by the given millis", () => {
    const clock = advanceableClock("2026-07-13T00:00:00.000Z");
    clock.advance(MS_PER_DAY);
    expect(clock.now().toISOString()).toBe("2026-07-14T00:00:00.000Z");
    clock.advance(2 * MS_PER_DAY);
    expect(clock.now().toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });

  it("steps backward with a negative delta and jumps absolutely with set()", () => {
    const clock = advanceableClock("2026-07-13T00:00:00.000Z");
    clock.advance(-MS_PER_DAY);
    expect(clock.now().toISOString()).toBe("2026-07-12T00:00:00.000Z");
    clock.set("2030-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  it("rejects a non-finite advance", () => {
    const clock = advanceableClock(0);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });

  it("substitutes for a plain Clock", () => {
    const clock: Clock = advanceableClock("2026-07-13T00:00:00.000Z");
    expect(clock.now()).toBeInstanceOf(Date);
  });
});
