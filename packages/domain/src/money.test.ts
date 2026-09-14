import { describe, it, expect } from "vitest";
import {
  add,
  clampAtZero,
  compare,
  equals,
  fromMajorUnits,
  isNegative,
  isPositive,
  isZero,
  minorUnitsPerMajor,
  money,
  multiply,
  negate,
  percentOf,
  scaleOf,
  subtract,
  sum,
  toMajorString,
  toMajorUnits,
  zero,
} from "./money";

describe("money() — floats are unrepresentable", () => {
  it("accepts an integer count of minor units", () => {
    expect(money(1234, "USD")).toEqual({ currency: "USD", minorUnits: 1234 });
  });

  it("REFUSES a fractional amount rather than silently truncating it", () => {
    expect(() => money(10.5, "USD")).toThrow(RangeError);
    expect(() => money(0.1 + 0.2, "USD")).toThrow(RangeError);
  });

  it("refuses NaN / Infinity / an unsafe integer", () => {
    expect(() => money(Number.NaN, "USD")).toThrow(RangeError);
    expect(() => money(Number.POSITIVE_INFINITY, "USD")).toThrow(RangeError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, "USD")).toThrow(RangeError);
  });
});

describe("per-currency scale — never a hardcoded 100", () => {
  it("knows each currency's minor-unit exponent", () => {
    expect(scaleOf("USD")).toBe(2);
    expect(scaleOf("JPY")).toBe(0);
    expect(minorUnitsPerMajor("USD")).toBe(100);
    expect(minorUnitsPerMajor("JPY")).toBe(1);
  });

  it("converts major→minor using the currency's own scale", () => {
    expect(fromMajorUnits(12.34, "USD").minorUnits).toBe(1234);
    expect(fromMajorUnits(1234, "JPY").minorUnits).toBe(1234);
    expect(fromMajorUnits(12.34, "ETB").minorUnits).toBe(1234);
  });

  it("refuses a major amount finer than the currency's scale", () => {
    expect(() => fromMajorUnits(12.345, "USD")).toThrow(RangeError);
    expect(() => fromMajorUnits(0.5, "JPY")).toThrow(RangeError);
  });

  it("round-trips through major units and formats exactly", () => {
    expect(toMajorUnits(money(1234, "USD"))).toBe(12.34);
    expect(toMajorString(money(1234, "USD"))).toBe("12.34");
    expect(toMajorString(money(5, "USD"))).toBe("0.05");
    expect(toMajorString(money(-1234, "USD"))).toBe("-12.34");
    expect(toMajorString(money(1234, "JPY"))).toBe("1234");
  });
});

describe("arithmetic", () => {
  it("adds and subtracts within a currency", () => {
    expect(add(money(100, "USD"), money(250, "USD"))).toEqual(money(350, "USD"));
    expect(subtract(money(100, "USD"), money(250, "USD"))).toEqual(money(-150, "USD"));
    expect(negate(money(100, "USD"))).toEqual(money(-100, "USD"));
  });

  it("REFUSES to mix currencies instead of producing a nonsense total", () => {
    expect(() => add(money(100, "USD"), money(100, "ETB"))).toThrow(TypeError);
    expect(() => subtract(money(100, "USD"), money(100, "JPY"))).toThrow(TypeError);
    expect(() => compare(money(100, "USD"), money(100, "EUR"))).toThrow(TypeError);
  });

  it("multiplies by a count or a fraction, staying on whole minor units", () => {
    expect(multiply(money(1000, "USD"), 12)).toEqual(money(12_000, "USD"));
    expect(multiply(money(1000, "USD"), 0.5)).toEqual(money(500, "USD"));
    expect(multiply(money(333, "USD"), 1 / 3)).toEqual(money(111, "USD"));
  });

  it("rounds halves away from zero, symmetrically for debits and credits", () => {
    expect(multiply(money(5, "USD"), 0.5).minorUnits).toBe(3);
    expect(multiply(money(-5, "USD"), 0.5).minorUnits).toBe(-3);
  });

  it("takes a whole-number percentage the way margins are stored", () => {
    expect(percentOf(money(32_000_00, "USD"), 50)).toEqual(money(16_000_00, "USD"));
    expect(percentOf(money(1000, "USD"), 0)).toEqual(zero("USD"));
  });

  it("sums a list against an explicit currency so an empty list still has one", () => {
    expect(sum([], "USD")).toEqual(zero("USD"));
    expect(sum([money(100, "USD"), money(250, "USD")], "USD")).toEqual(money(350, "USD"));
    expect(() => sum([money(100, "ETB")], "USD")).toThrow(TypeError);
  });
});

describe("predicates", () => {
  it("compares, equates and classifies", () => {
    expect(compare(money(100, "USD"), money(250, "USD"))).toBeLessThan(0);
    expect(compare(money(250, "USD"), money(100, "USD"))).toBeGreaterThan(0);
    expect(compare(money(100, "USD"), money(100, "USD"))).toBe(0);
    expect(equals(money(100, "USD"), money(100, "USD"))).toBe(true);
    expect(equals(money(100, "USD"), money(100, "ETB"))).toBe(false);
    expect(isZero(zero("USD"))).toBe(true);
    expect(isNegative(money(-1, "USD"))).toBe(true);
    expect(isPositive(money(1, "USD"))).toBe(true);
  });

  it("clamps a negative accrual to zero without touching a positive one", () => {
    expect(clampAtZero(money(-500, "USD"))).toEqual(zero("USD"));
    expect(clampAtZero(money(500, "USD"))).toEqual(money(500, "USD"));
  });
});
