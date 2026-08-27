import { describe, it, expect } from "vitest";
import { leadToCandidateInput, type LeadForPromotion } from "./lead.promote-map";

/** A lead with valid, enum-matching sourcing vocab. */
function lead(overrides: Partial<LeadForPromotion> = {}): LeadForPromotion {
  return {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    credential: "PMHNP",
    state: "NJ",
    source: "LinkedIn",
    tags: ["Priority", "Bilingual"],
    clientId: "cl1",
    ...overrides,
  };
}

describe("leadToCandidateInput", () => {
  it("passes through contact + valid enum vocab, defaults track to Clinical", () => {
    const input = leadToCandidateInput(lead());
    expect(input).toMatchObject({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-0100",
      credential: "PMHNP",
      state: "NJ",
      licenseState: "NJ", // state seeds BOTH state and licenseState
      source: "LinkedIn",
      tags: ["Priority", "Bilingual"],
      track: "Clinical",
      clientId: "cl1",
    });
  });

  it("COERCES a non-vocab credential to null (raw job title dropped)", () => {
    expect(
      leadToCandidateInput(lead({ credential: "Senior Nurse Practitioner II" })).credential,
    ).toBeNull();
  });

  it("COERCES a non-vocab state to null (both state and licenseState)", () => {
    const input = leadToCandidateInput(lead({ state: "New Jersey" }));
    expect(input.state).toBeNull();
    expect(input.licenseState).toBeNull();
  });

  it("COERCES a non-vocab source to null", () => {
    expect(leadToCandidateInput(lead({ source: "some sourcing tool" })).source).toBeNull();
  });

  it("FILTERS tags to valid TAGS members only", () => {
    const input = leadToCandidateInput(
      lead({ tags: ["Priority", "not-a-tag", "Compact License"] }),
    );
    expect(input.tags).toEqual(["Priority", "Compact License"]);
  });

  it("carries null contact fields through and a null clientId", () => {
    const input = leadToCandidateInput(
      lead({ email: null, phone: null, clientId: null, tags: [] }),
    );
    expect(input.email).toBeNull();
    expect(input.phone).toBeNull();
    expect(input.clientId).toBeNull();
    expect(input.tags).toEqual([]);
  });

  it("does NOT leak pipeline / status / license-verification fields into the input", () => {
    const input = leadToCandidateInput(lead()) as unknown as Record<string, unknown>;
    expect("status" in input).toBe(false);
    expect("stageOrder" in input).toBe(false);
    expect("licenseStatus" in input).toBe(false);
    expect("licenseNumber" in input).toBe(false);
  });
});
