import { describe, it, expect } from "vitest";
import { scoreStateSimilarity } from "./similarity";

describe("scoreStateSimilarity", () => {
  it("scores 100 for an exact state match", () => {
    expect(scoreStateSimilarity("CT", "CT")).toBe(100);
  });

  it("scores 60 when both states are NLC compact members (CT and TX both are)", () => {
    expect(scoreStateSimilarity("CT", "TX")).toBe(60);
  });

  it("scores 30 when only the anchor state is compact (CA is not NLC)", () => {
    expect(scoreStateSimilarity("CT", "CA")).toBe(30);
  });

  it("scores 30 when only the result state is compact", () => {
    expect(scoreStateSimilarity("CA", "CT")).toBe(30);
  });

  it("scores 30 when neither state is compact", () => {
    expect(scoreStateSimilarity("CA", "NY")).toBe(30);
  });

  it("scores 30 when either state is null", () => {
    expect(scoreStateSimilarity(null, "CT")).toBe(30);
    expect(scoreStateSimilarity("CT", null)).toBe(30);
    expect(scoreStateSimilarity(null, null)).toBe(30);
  });
});
