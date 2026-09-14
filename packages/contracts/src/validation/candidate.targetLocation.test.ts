import { describe, it, expect } from "vitest";
import { createCandidateSchema, updateCandidateSchema } from "./candidate";

describe("targetLocation — Wave 5.5 backlog (legacy TargetLocation)", () => {
  it("createCandidateSchema accepts a comma-joined free-text value", () => {
    const parsed = createCandidateSchema.parse({
      name: "Jane Doe",
      targetLocation: "Danbury CT, Stamford CT",
    });
    expect(parsed.targetLocation).toBe("Danbury CT, Stamford CT");
  });

  it("trims whitespace", () => {
    const parsed = createCandidateSchema.parse({
      name: "Jane Doe",
      targetLocation: "  Danbury CT  ",
    });
    expect(parsed.targetLocation).toBe("Danbury CT");
  });

  it("allows null (explicit clear) and omission (untouched) on update", () => {
    expect(updateCandidateSchema.parse({ targetLocation: null }).targetLocation).toBeNull();
    expect(updateCandidateSchema.parse({}).targetLocation).toBeUndefined();
  });

  it("rejects a value over 500 chars", () => {
    expect(() =>
      createCandidateSchema.parse({ name: "Jane Doe", targetLocation: "a".repeat(501) }),
    ).toThrow();
  });

  it("accepts exactly 500 chars", () => {
    const parsed = createCandidateSchema.parse({
      name: "Jane Doe",
      targetLocation: "a".repeat(500),
    });
    expect(parsed.targetLocation).toHaveLength(500);
  });
});
