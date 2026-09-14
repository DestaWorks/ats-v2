import { describe, it, expect } from "vitest";
import { canConfirmPurge } from "./trash-actions";

describe("canConfirmPurge", () => {
  it("confirms on an exact match", () => {
    expect(canConfirmPurge("Jane Doe", "Jane Doe")).toBe(true);
  });

  it("forgives surrounding whitespace on both sides", () => {
    expect(canConfirmPurge("  Jane Doe  ", "Jane Doe")).toBe(true);
    expect(canConfirmPurge("Jane Doe", "  Jane Doe  ")).toBe(true);
  });

  it("is case-sensitive (a case mismatch does not confirm)", () => {
    expect(canConfirmPurge("jane doe", "Jane Doe")).toBe(false);
    expect(canConfirmPurge("JANE DOE", "Jane Doe")).toBe(false);
  });

  it("does not confirm on a partial or mismatched name", () => {
    expect(canConfirmPurge("Jane", "Jane Doe")).toBe(false);
    expect(canConfirmPurge("Jane Doe", "John Doe")).toBe(false);
    expect(canConfirmPurge("", "Jane Doe")).toBe(false);
  });

  it("never confirms against a blank candidate name (defensive)", () => {
    expect(canConfirmPurge("", "")).toBe(false);
    expect(canConfirmPurge("   ", "   ")).toBe(false);
  });
});
