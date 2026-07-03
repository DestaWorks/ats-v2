import { describe, it, expect } from "vitest";
import { checkStageGate, canTransition } from "./stage-gates";
import type { RuleCandidate } from "./types";

const clinical: RuleCandidate = {
  status: "NEW_CANDIDATE",
  track: "Clinical",
  credential: "PMHNP",
  licenseState: "CT",
  licenseStatus: "Active",
  clientId: "client_1",
  email: "a@b.com",
  phone: null,
};

describe("checkStageGate — QUALIFIED_PRESCREEN", () => {
  it("requires credential + license state for clinical", () => {
    expect(checkStageGate(clinical, "QUALIFIED_PRESCREEN")).toEqual([]);
    expect(checkStageGate({ ...clinical, credential: null }, "QUALIFIED_PRESCREEN")).toContain(
      "Credential required",
    );
    expect(checkStageGate({ ...clinical, licenseState: null }, "QUALIFIED_PRESCREEN")).toContain(
      "License state required",
    );
  });

  it("requires only contact info for operations", () => {
    const ops: RuleCandidate = {
      status: "NEW_CANDIDATE",
      track: "Operations",
      credential: null,
      licenseState: null,
      email: "ops@x.com",
      phone: null,
    };
    expect(checkStageGate(ops, "QUALIFIED_PRESCREEN")).toEqual([]);
    expect(checkStageGate({ ...ops, email: null, phone: null }, "QUALIFIED_PRESCREEN")).toContain(
      "Contact info required (email or phone)",
    );
  });
});

describe("checkStageGate — INITIAL_SCREENING", () => {
  it("blocks clinical when license is Not Verified", () => {
    expect(
      checkStageGate({ ...clinical, licenseStatus: "Not Verified" }, "INITIAL_SCREENING"),
    ).toContain("License must be verified first");
    expect(checkStageGate(clinical, "INITIAL_SCREENING")).toEqual([]);
  });

  it("does not block operations on license", () => {
    const ops: RuleCandidate = {
      status: "NEW_CANDIDATE",
      track: "Operations",
      licenseStatus: "Not Verified",
      email: "o@x.com",
    };
    expect(checkStageGate(ops, "INITIAL_SCREENING")).toEqual([]);
  });
});

describe("checkStageGate — SUBMITTED_TO_CLIENT", () => {
  it("requires Active license (clinical), a client, and contact", () => {
    expect(checkStageGate(clinical, "SUBMITTED_TO_CLIENT")).toEqual([]);

    const errs = checkStageGate(
      { ...clinical, licenseStatus: "Not Verified", clientId: null, email: null, phone: null },
      "SUBMITTED_TO_CLIENT",
    );
    expect(errs).toContain("License must be Active");
    expect(errs).toContain("Client assignment required");
    expect(errs).toContain("Contact info required");
  });

  it("waives the license requirement for operations but still needs a client + contact", () => {
    const ops: RuleCandidate = {
      status: "NEW_CANDIDATE",
      track: "Operations",
      licenseStatus: null,
      clientId: "c1",
      email: "o@x.com",
    };
    expect(checkStageGate(ops, "SUBMITTED_TO_CLIENT")).toEqual([]);
    expect(checkStageGate({ ...ops, clientId: null }, "SUBMITTED_TO_CLIENT")).toContain(
      "Client assignment required",
    );
  });
});

describe("ungated stages", () => {
  it("allows interview → started with no requirements", () => {
    for (const s of [
      "CLIENT_INTERVIEW",
      "OFFER_NEGOTIATION",
      "OFFER_ACCEPTED",
      "STARTED_DAY1",
    ] as const) {
      expect(checkStageGate({ status: "NEW_CANDIDATE", track: "Clinical" }, s)).toEqual([]);
      expect(canTransition({ status: "NEW_CANDIDATE", track: "Clinical" }, s)).toBe(true);
    }
  });

  it("canTransition mirrors checkStageGate", () => {
    expect(canTransition({ ...clinical, credential: null }, "QUALIFIED_PRESCREEN")).toBe(false);
    expect(canTransition(clinical, "QUALIFIED_PRESCREEN")).toBe(true);
  });
});
