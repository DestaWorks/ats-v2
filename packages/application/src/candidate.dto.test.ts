import { describe, it, expect, vi } from "vitest";

/**
 * Proves the DTO's PII boundary: `licenseNumber` is returned only to a `viewCredentials`
 * holder, and `toRuleCandidate` yields a shape the pure rules accept. No DB — we hand-build a
 * candidate row and exercise the pure mappers.
 */

// `server-only` throws outside an RSC build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

import { toCandidateDTO, toRuleCandidate } from "./candidate.dto";
import type { CandidateRow } from "@destaworks/db/repositories/candidate.repository";
import { fixedClock } from "@destaworks/domain/clock";
import { scoreCandidate } from "@destaworks/domain/rules/scoring";
import { checkStageGate } from "@destaworks/domain/rules/stage-gates";
import type { ClientRules } from "@destaworks/domain/rules/types";

const NOW = fixedClock("2026-08-21T12:00:00Z").now();

const row: CandidateRow = {
  id: "c1",
  legacyId: null,
  tenantId: null,
  name: "Jane Prescriber",
  email: "jane@example.com",
  phone: "555-0100",
  city: "Newark",
  state: "NJ",
  targetLocation: null,
  employer: "Acme Health",
  yearsExp: 8,
  credential: "PMHNP",
  population: "Adult",
  setting: "Telehealth",
  telehealthPref: null,
  track: "Clinical",
  source: "LinkedIn",
  tags: ["Priority"],
  outreachAttempts: 0,
  licenseState: "NJ",
  licenseNumber: "RN-123456",
  licenseStatus: "Active",
  licenseExpiry: null,
  licenseVerifiedAt: null,
  licenseVerifiedById: null,
  status: "NEW_CANDIDATE",
  stageOrder: 0,
  stageEnteredAt: new Date("2026-01-01T00:00:00Z"),
  placedAt: null,
  clientId: "cl1",
  filledFromRoleId: null,
  createdById: "u1",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
  deletedById: null,
};

describe("toCandidateDTO — licenseNumber PII gate", () => {
  it("includes licenseNumber for a viewCredentials holder", () => {
    const dto = toCandidateDTO(row, { role: "Owner" });
    expect(dto.licenseNumber).toBe("RN-123456");
  });

  it("omits licenseNumber for a viewer without the capability", () => {
    const dto = toCandidateDTO(row, { role: "Associate" });
    expect("licenseNumber" in dto).toBe(false);
    // non-sensitive fields still pass through
    expect(dto.name).toBe("Jane Prescriber");
    expect(dto.email).toBe("jane@example.com");
  });
});

describe("toRuleCandidate — feeds the pure rules", () => {
  const ruleCandidate = toRuleCandidate(row);

  it("maps the rule-relevant fields 1:1", () => {
    expect(ruleCandidate).toMatchObject({
      status: "NEW_CANDIDATE",
      track: "Clinical",
      credential: "PMHNP",
      licenseState: "NJ",
      licenseStatus: "Active",
      population: "Adult",
      setting: "Telehealth",
      clientId: "cl1",
      email: "jane@example.com",
      phone: "555-0100",
    });
  });

  it("scores against client rules without error", () => {
    const clientRules: ClientRules = {
      name: "Sterling Institute",
      states: ["NJ"],
      creds: ["PMHNP"],
      pops: ["Adult"],
      settings: ["Telehealth"],
    };
    const result = scoreCandidate(ruleCandidate, clientRules, NOW);
    expect(result.pct).toBe(100);
    expect(result.flags).toHaveLength(0);
  });

  it("passes through a stage gate without throwing", () => {
    expect(checkStageGate(ruleCandidate, "QUALIFIED_PRESCREEN", NOW)).toEqual([]);
  });
});
