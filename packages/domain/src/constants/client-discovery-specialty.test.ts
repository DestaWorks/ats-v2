import { describe, it, expect } from "vitest";
import {
  CLIENT_DISCOVERY_SPECIALTIES,
  CLIENT_DISCOVERY_SPECIALTY_GROUPS,
  isClientDiscoverySpecialty,
  specialtyTaxonomyQuery,
} from "./client-discovery-specialty";

describe("CLIENT_DISCOVERY_SPECIALTIES", () => {
  it("flattens all 9 groups into 34 options, matching the legacy reference dropdown", () => {
    expect(CLIENT_DISCOVERY_SPECIALTY_GROUPS).toHaveLength(9);
    expect(CLIENT_DISCOVERY_SPECIALTIES).toHaveLength(34);
    expect(CLIENT_DISCOVERY_SPECIALTIES).toContain("Behavioral Health");
    expect(CLIENT_DISCOVERY_SPECIALTIES).toContain("Behavior Analyst (BCBA)");
  });

  it("isClientDiscoverySpecialty guards real vs. bogus values", () => {
    expect(isClientDiscoverySpecialty("Psychiatry")).toBe(true);
    expect(isClientDiscoverySpecialty("Not A Real Specialty")).toBe(false);
  });
});

describe("specialtyTaxonomyQuery — parity with legacy/Code.gs's SPECIALTY_MAP", () => {
  it("remaps the 5 explicit legacy entries", () => {
    expect(specialtyTaxonomyQuery("Behavioral Health")).toBe("Behavioral");
    expect(specialtyTaxonomyQuery("Psychiatry")).toBe("Psychiatric");
    expect(specialtyTaxonomyQuery("Long-term Care")).toBe("Nursing");
    expect(specialtyTaxonomyQuery("Multi-Specialty")).toBe("Multi-Specialty");
    expect(specialtyTaxonomyQuery("Other Specialty")).toBe("");
  });

  it("passes every other specialty's own label straight through as the query", () => {
    expect(specialtyTaxonomyQuery("Clinical Social Worker (LCSW)")).toBe(
      "Clinical Social Worker (LCSW)",
    );
    expect(specialtyTaxonomyQuery("Behavior Analyst (BCBA)")).toBe("Behavior Analyst (BCBA)");
  });
});
