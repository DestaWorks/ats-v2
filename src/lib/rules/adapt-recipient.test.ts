import { describe, it, expect } from "vitest";
import {
  adaptCandidateToRecipient,
  adaptLeadToRecipient,
  type CandidateRecipientSource,
  type LeadRecipientSource,
} from "./adapt-recipient";

const CANDIDATE: CandidateRecipientSource = {
  name: "Jane Doe",
  credential: "PMHNP",
  licenseState: "CT",
  licenseNumber: "PMH-12345",
  licenseStatus: "Active",
  yearsExp: 5,
  employer: "Acme Health",
  population: "Adult",
  setting: "Outpatient",
  telehealthPref: "Hybrid",
  city: "Hartford",
  email: "jane@example.com",
  phone: "555-1234",
};

const LEAD: LeadRecipientSource = {
  name: "John Smith",
  credential: "LCSW",
  state: "NJ",
  email: "john@example.com",
  phone: "555-6789",
};

describe("adaptCandidateToRecipient", () => {
  it("maps every candidate field to the matching recipient field", () => {
    expect(adaptCandidateToRecipient(CANDIDATE)).toEqual({
      name: "Jane Doe",
      credential: "PMHNP",
      licenseState: "CT",
      licenseNumber: "PMH-12345",
      licenseStatus: "Active",
      npi: null,
      yearsExp: 5,
      specialty: null,
      employer: "Acme Health",
      population: "Adult",
      setting: "Outpatient",
      telehealthPref: "Hybrid",
      city: "Hartford",
      email: "jane@example.com",
      phone: "555-1234",
      targetLocations: null,
    });
  });

  it("defaults a missing (gated) licenseNumber to null instead of undefined", () => {
    const { licenseNumber, ...rest } = CANDIDATE;
    void licenseNumber;
    expect(adaptCandidateToRecipient(rest).licenseNumber).toBeNull();
  });
});

describe("adaptLeadToRecipient", () => {
  it("maps name/credential/state/email/phone and leaves clinical fields null", () => {
    expect(adaptLeadToRecipient(LEAD)).toEqual({
      name: "John Smith",
      credential: "LCSW",
      licenseState: "NJ",
      licenseNumber: null,
      licenseStatus: null,
      npi: null,
      yearsExp: null,
      specialty: null,
      employer: null,
      population: null,
      setting: null,
      telehealthPref: null,
      city: null,
      email: "john@example.com",
      phone: "555-6789",
      targetLocations: null,
    });
  });
});
