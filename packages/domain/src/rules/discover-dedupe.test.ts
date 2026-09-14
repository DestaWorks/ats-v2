import { describe, it, expect } from "vitest";
import { classifyDiscoverRow, type DupCandidateSets } from "./discover-dedupe";

function emptySets(): DupCandidateSets {
  return { leadsByNpi: new Map(), leadsByName: new Map(), candidatesByName: new Map() };
}

describe("classifyDiscoverRow", () => {
  it("returns new when nothing matches", () => {
    const result = classifyDiscoverRow({ npi: "1234567890", fullName: "Jane Doe" }, emptySets());
    expect(result).toEqual({ status: "new", matchedId: null, matchedLabel: null });
  });

  it("matches a lead by NPI even when the name doesn't collide with anything", () => {
    const sets = emptySets();
    sets.leadsByNpi.set("1234567890", { id: "l1", status: "Sourced" });
    const result = classifyDiscoverRow({ npi: "1234567890", fullName: "Jane Doe" }, sets);
    expect(result).toEqual({ status: "in_sourcing", matchedId: "l1", matchedLabel: "Sourced" });
  });

  it("NPI match wins over a coincidental name that would otherwise not match anything", () => {
    const sets = emptySets();
    sets.leadsByNpi.set("1234567890", { id: "l1", status: "Outreach 1" });
    const result = classifyDiscoverRow(
      { npi: "1234567890", fullName: "Completely Different" },
      sets,
    );
    expect(result.status).toBe("in_sourcing");
    expect(result.matchedId).toBe("l1");
  });

  it("falls back to a lead name match when NPI doesn't match", () => {
    const sets = emptySets();
    sets.leadsByName.set("jane doe", { id: "l2", status: "Responded — Hot" });
    const result = classifyDiscoverRow({ npi: "9999999999", fullName: "Jane Doe" }, sets);
    expect(result).toEqual({
      status: "in_sourcing",
      matchedId: "l2",
      matchedLabel: "Responded — Hot",
    });
  });

  it("a candidate name match wins over a lead match for the same name", () => {
    const sets = emptySets();
    sets.leadsByName.set("jane doe", { id: "l3", status: "Sourced" });
    sets.candidatesByName.set("jane doe", { id: "c1", status: "3 - Screening" });
    const result = classifyDiscoverRow({ npi: "9999999999", fullName: "Jane Doe" }, sets);
    expect(result).toEqual({
      status: "in_pipeline",
      matchedId: "c1",
      matchedLabel: "3 - Screening",
    });
  });

  it("a candidate name match wins even when the NPI also matches a lead", () => {
    const sets = emptySets();
    sets.leadsByNpi.set("1234567890", { id: "l4", status: "Sourced" });
    sets.candidatesByName.set("jane doe", { id: "c2", status: "8 - Started (Day 1)" });
    const result = classifyDiscoverRow({ npi: "1234567890", fullName: "Jane Doe" }, sets);
    expect(result.status).toBe("in_pipeline");
    expect(result.matchedId).toBe("c2");
  });

  it("matches names case-insensitively and ignores leading/trailing whitespace", () => {
    const sets = emptySets();
    sets.candidatesByName.set("jane doe", { id: "c3", status: "1 - Initial Screening" });
    const result = classifyDiscoverRow({ npi: "9999999999", fullName: "  JANE DOE  " }, sets);
    expect(result).toEqual({
      status: "in_pipeline",
      matchedId: "c3",
      matchedLabel: "1 - Initial Screening",
    });
  });
});
