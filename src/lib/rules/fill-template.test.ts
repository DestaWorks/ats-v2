import { describe, it, expect } from "vitest";
import { fillTemplate, type TemplateFillContext, type TemplateRecipient } from "./fill-template";

const RECIPIENT: TemplateRecipient = {
  name: "Jane Doe",
  credential: "PMHNP",
  licenseState: "CT",
  licenseNumber: "PMH-12345",
  licenseStatus: "Active",
  npi: "1234567890",
  yearsExp: 5,
  specialty: "Adult psychiatry",
  employer: "Acme Health",
  population: "Adult",
  setting: "Outpatient",
  telehealthPref: "Hybrid",
  city: "Hartford",
  email: "jane@example.com",
  phone: "555-1234",
  targetLocations: "CT, NJ",
};

const BASE_CTX: TemplateFillContext = {
  recipient: RECIPIENT,
  clientName: "Sterling Institute",
  clientDesc: "mental health practice in Connecticut",
  clientContact: "Hiring Manager",
  clientHighlights: "competitive compensation",
  recruiterName: "Leliso Agegnehu",
  today: "1/1/2026",
};

describe("fillTemplate", () => {
  it("fills every recipient-backed token from the given recipient", () => {
    const out = fillTemplate(
      "{name} {credential} {licenseState} {licenseNumber} {licenseStatus} {npi} {yearsExp} {specialty} {employer} {population} {setting} {telehealth} {city} {email} {phone} {targetLocations}",
      BASE_CTX,
    );
    expect(out).toBe(
      "Jane Doe PMHNP CT PMH-12345 Active 1234567890 5 Adult psychiatry Acme Health Adult Outpatient Hybrid Hartford jane@example.com 555-1234 CT, NJ",
    );
  });

  it("falls back to bracket placeholders when recipient is null", () => {
    const out = fillTemplate("{name} / {credential} / {licenseState}", {
      ...BASE_CTX,
      recipient: null,
    });
    expect(out).toBe("[Candidate Name] / [Credential] / [State]");
  });

  it("falls back per-field when a recipient field is null (e.g. a synthesized lead)", () => {
    const out = fillTemplate("{licenseNumber} / {licenseStatus} / {npi}", {
      ...BASE_CTX,
      recipient: { ...RECIPIENT, licenseNumber: null, licenseStatus: null, npi: null },
    });
    expect(out).toBe("[License #] / Not Verified / [NPI]");
  });

  it("{client}/{clientDesc}/{clientContact}/{highlights} come from ctx, not the recipient", () => {
    const out = fillTemplate("{client} — {clientDesc} — {clientContact} — {highlights}", BASE_CTX);
    expect(out).toBe(
      "Sterling Institute — mental health practice in Connecticut — Hiring Manager — competitive compensation",
    );
  });

  it("{role} maps to credential, not an open-role title", () => {
    expect(fillTemplate("{role}", BASE_CTX)).toBe("PMHNP");
    expect(fillTemplate("{role}", { ...BASE_CTX, recipient: null })).toBe("[Role]");
  });

  it("{location} is ' in <state>' when a state is present, else empty string (not a bracket)", () => {
    expect(fillTemplate("Team{location}.", BASE_CTX)).toBe("Team in CT.");
    expect(
      fillTemplate("Team{location}.", {
        ...BASE_CTX,
        recipient: { ...RECIPIENT, licenseState: null },
      }),
    ).toBe("Team.");
    expect(fillTemplate("Team{location}.", { ...BASE_CTX, recipient: null })).toBe("Team.");
  });

  it("recruiter/today come from ctx directly", () => {
    expect(fillTemplate("{recruiter} on {today}", BASE_CTX)).toBe("Leliso Agegnehu on 1/1/2026");
  });

  it("always-placeholder tokens never resolve from data", () => {
    const out = fillTemplate(
      "{schedule}|{matchNotes}|{count}|{slot1}|{slot2}|{slot3}|{deadline}|{referencesStatus}|{bgStatus}|{bgDate}",
      BASE_CTX,
    );
    expect(out).toBe(
      "[Schedule/Availability]|[Why this candidate fits this client]|[#]|[Day/Time Option 1]|[Day/Time Option 2]|[Day/Time Option 3]|[Deadline Date]|[Pending/Collected]|[Clear/Pending/Flagged]|[Date]",
    );
  });

  it("replaces every occurrence of a repeated token (global regex)", () => {
    expect(fillTemplate("{name} and {name} again", BASE_CTX)).toBe("Jane Doe and Jane Doe again");
  });
});
