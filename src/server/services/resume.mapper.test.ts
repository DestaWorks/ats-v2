import { describe, it, expect, vi } from "vitest";

/**
 * Pure mapper tests (Wave 1.2 §8): each variant maps to the right track; credential/population/
 * setting collapse onto the fixed vocab (incl. unmapped → null); license status/expiry parse;
 * operations carry no license; and `status` is NEVER set (create forces NEW_CANDIDATE). Rich
 * fields (snapshot, DEA, NPI, …) are absent from the Candidate input — they belong in extractedData.
 */

vi.mock("server-only", () => ({}));

import { toCandidateCreateInput } from "./resume.mapper";
import type { ClinicalResume, OperationsResume, PrescriberResume } from "@/lib/validation/resume";

function base() {
  return {
    name: "Jane Doe",
    headerRole: "Licensed Professional Counselor",
    email: "jane@example.com",
    phone: "(555) 555-0100",
    homeBase: { city: "Austin", stateOrCountry: "TX", timezone: "CT" },
    workMode: "Telehealth",
    targetStart: "Negotiable",
    snapshot: "A snapshot paragraph.",
    verificationLine: "TX BHEC license; NPI via NPPES",
    experience: [
      {
        title: "Therapist",
        dates: "Jan 2020 – Present",
        employer: "Acme Health",
        setting: "Outpatient + telehealth",
        location: "Austin, TX",
        contextLine: "Caseload of 40 adults",
        bullets: ["Did a thing"],
      },
    ],
    education: [{ degree: "MS", school: "UT", location: "Austin, TX", year: "2018", honor: "" }],
  };
}

function clinical(overrides: Partial<ClinicalResume> = {}): ClinicalResume {
  return {
    ...base(),
    licensure: [
      {
        type: "Licensed Professional Counselor",
        state: "TX",
        number: "LPC-12345",
        status: "Active",
        expires: "May 2027",
      },
    ],
    npi: "1234567890",
    caqhAttestedDate: "May 2026",
    skills: { modalities: ["CBT"], populations: ["Adults", "Adolescents (14+)"] },
    ...overrides,
  };
}

function prescriber(overrides: Partial<PrescriberResume> = {}): PrescriberResume {
  return {
    ...base(),
    licensure: [
      {
        type: "Physician & Surgeon (MD)",
        state: "TX",
        number: "MD-999",
        status: "Active",
        expires: "Dec 2028",
      },
    ],
    boardCertifications: ["Board Certified — Psychiatry (ABPN)"],
    npi: "1234567890",
    dea: [{ state: "TX", number: "AB1234567" }],
    caqhAttestedDate: "Apr 2026",
    hospitalAffiliations: [],
    publications: [],
    skills: { modalities: ["Psychopharmacology"], populations: ["Adults 18-65"] },
    ...overrides,
  };
}

function operations(overrides: Partial<OperationsResume> = {}): OperationsResume {
  return {
    ...base(),
    coverageHours: "US ET business hours",
    englishLevel: "C1",
    referencesStatus: "pending",
    systemsTools: ["Athenahealth"],
    skills: { functional: ["Insurance eligibility verification"] },
    ...overrides,
  };
}

describe("toCandidateCreateInput", () => {
  it("maps a clinical résumé onto the Clinical track with license + credential", () => {
    const input = toCandidateCreateInput("clinical", clinical());
    expect(input.track).toBe("Clinical");
    expect(input.name).toBe("Jane Doe");
    expect(input.email).toBe("jane@example.com");
    expect(input.city).toBe("Austin");
    expect(input.state).toBe("TX");
    expect(input.employer).toBe("Acme Health");
    expect(input.credential).toBe("LPC");
    expect(input.licenseState).toBe("TX");
    expect(input.licenseNumber).toBe("LPC-12345");
    expect(input.licenseStatus).toBe("Active");
    expect(input.licenseExpiry).toEqual(new Date(Date.UTC(2027, 4, 1)));
    expect(input.population).toBe("Child/Adolescent"); // adolescents present → C/A
    expect(input.setting).toBe("Outpatient"); // experience setting "Outpatient + telehealth"
    // status is never set by the mapper
    expect("status" in input).toBe(false);
  });

  it("maps a prescriber résumé onto the Prescriber track with MD credential + DEA-bearing license", () => {
    const input = toCandidateCreateInput("prescriber", prescriber());
    expect(input.track).toBe("Prescriber");
    expect(input.credential).toBe("MD");
    expect(input.licenseState).toBe("TX");
    expect(input.licenseNumber).toBe("MD-999");
    expect(input.licenseExpiry).toEqual(new Date(Date.UTC(2028, 11, 1)));
    // Rich fields never leak onto Candidate columns.
    expect("dea" in input).toBe(false);
    expect("npi" in input).toBe(false);
    expect("snapshot" in input).toBe(false);
  });

  it("maps an operations résumé onto the Operations track with NO license/credential", () => {
    const input = toCandidateCreateInput("operations", operations());
    expect(input.track).toBe("Operations");
    expect(input.credential).toBeNull();
    expect(input.population).toBeNull();
    expect(input.licenseState).toBeUndefined();
    expect(input.licenseNumber).toBeUndefined();
    expect(input.setting).toBe("Outpatient"); // experience setting scanned before workMode
  });

  it("returns null for an unmapped credential and unmapped population", () => {
    const input = toCandidateCreateInput(
      "clinical",
      clinical({
        licensure: [
          { type: "Some Unknown Cert", state: "TX", number: "", status: "", expires: "" },
        ],
        skills: { modalities: [], populations: ["Extraterrestrials"] },
      }),
    );
    expect(input.credential).toBeNull();
    expect(input.population).toBeNull();
    expect(input.licenseStatus).toBe("Not Verified"); // empty status → default
    expect(input.licenseExpiry).toBeNull();
    expect(input.licenseNumber).toBeNull();
  });

  it("drops the '—' license-state placeholder and empty contact fields to null", () => {
    const input = toCandidateCreateInput(
      "clinical",
      clinical({
        email: "",
        phone: "  ",
        licensure: [
          {
            type: "EMDR Certified Therapist",
            state: "—",
            number: "",
            status: "Certified",
            expires: "",
          },
        ],
      }),
    );
    expect(input.email).toBeNull();
    expect(input.phone).toBeNull();
    expect(input.licenseState).toBeNull();
    expect(input.licenseStatus).toBe("Active"); // "Certified" → Active
  });
});
