import { describe, expect, it } from "vitest";
import { fixedClock } from "@destaworks/domain/clock";
import { checkStageGate } from "@destaworks/domain/rules/stage-gates";
import {
  buildStageMoverOptions,
  toRuleCandidate,
  type StageMoverCandidate,
} from "./stage-mover-options";

const NOW = fixedClock("2026-08-21T12:00:00Z").now();

/** A clinical candidate missing the license/credential the early gates require. */
const bareClinical: StageMoverCandidate = {
  status: "NEW_CANDIDATE",
  track: "Clinical",
  credential: null,
  licenseState: null,
  licenseStatus: "Not Verified",
  licenseExpiry: null,
  population: null,
  setting: null,
  clientId: null,
  email: null,
  phone: null,
};

/** A fully-qualified clinical candidate: contact + credential + active license + client. */
const readyClinical: StageMoverCandidate = {
  status: "DESTA_REVIEW",
  track: "Clinical",
  credential: "PMHNP",
  licenseState: "AZ",
  licenseStatus: "Active",
  licenseExpiry: null,
  population: "Adult",
  setting: "Telehealth",
  clientId: "client-1",
  email: "a@b.com",
  phone: "555-0100",
};

describe("buildStageMoverOptions", () => {
  it("emits one option per pipeline status and marks the current stage", () => {
    const opts = buildStageMoverOptions(bareClinical, NOW);
    expect(opts).toHaveLength(13);
    const current = opts.filter((o) => o.current);
    expect(current).toHaveLength(1);
    expect(current[0]?.code).toBe("NEW_CANDIDATE");
    // The current stage is never gate-flagged (staying put is a no-op).
    expect(current[0]?.valid).toBe(true);
    expect(current[0]?.reasons).toEqual([]);
  });

  it("flags gated targets as INVALID with the gate's reasons for an unqualified candidate", () => {
    const opts = buildStageMoverOptions(bareClinical, NOW);
    const byCode = new Map(opts.map((o) => [o.code, o]));

    const qualified = byCode.get("QUALIFIED_PRESCREEN")!;
    expect(qualified.valid).toBe(false);
    expect(qualified.reasons).toContain("Credential required");
    expect(qualified.reasons).toContain("License state required");

    const submitted = byCode.get("SUBMITTED_TO_CLIENT")!;
    expect(submitted.valid).toBe(false);
    expect(submitted.reasons).toContain("License must be Active");
    expect(submitted.reasons).toContain("Client assignment required");
    expect(submitted.reasons).toContain("Contact info required");

    // Each invalid option's `valid` flag must agree with the gate it mirrors.
    for (const o of opts) {
      if (o.current) continue;
      expect(o.valid).toBe(checkStageGate(toRuleCandidate(bareClinical), o.code, NOW).length === 0);
    }
  });

  it("marks gated targets VALID once the candidate satisfies the gates", () => {
    const opts = buildStageMoverOptions(readyClinical, NOW);
    const byCode = new Map(opts.map((o) => [o.code, o]));
    expect(byCode.get("SUBMITTED_TO_CLIENT")!.valid).toBe(true);
    expect(byCode.get("INITIAL_SCREENING")!.valid).toBe(true);
    // Ungated late stages are always valid.
    expect(byCode.get("OFFER_ACCEPTED")!.valid).toBe(true);
  });

  it("treats Operations candidates by the contact-only rule", () => {
    const ops: StageMoverCandidate = {
      ...bareClinical,
      track: "Operations",
      email: "ops@desta.com",
    };
    const byCode = new Map(buildStageMoverOptions(ops, NOW).map((o) => [o.code, o]));
    // Operations needs only contact info — no credential/license gate blocks the pre-screen.
    expect(byCode.get("QUALIFIED_PRESCREEN")!.valid).toBe(true);
    expect(byCode.get("SUBMITTED_TO_CLIENT")!.reasons).toContain("Client assignment required");
  });

  it("mirrors the server when an Active license has lapsed", () => {
    // The client mirror must not offer a move the server's gate will reject: `licenseExpiry` is
    // part of the gate input, so a lapsed license has to disable SUBMITTED_TO_CLIENT here too.
    const lapsed: StageMoverCandidate = {
      ...readyClinical,
      licenseExpiry: "2020-01-01T00:00:00.000Z",
    };
    const byCode = new Map(buildStageMoverOptions(lapsed, NOW).map((o) => [o.code, o]));
    expect(byCode.get("SUBMITTED_TO_CLIENT")!.valid).toBe(false);
    expect(byCode.get("SUBMITTED_TO_CLIENT")!.reasons).toContain("License must be Active");
    // And it agrees with the server rule it mirrors, option for option.
    for (const o of buildStageMoverOptions(lapsed, NOW)) {
      if (o.current) continue;
      expect(o.valid).toBe(checkStageGate(toRuleCandidate(lapsed), o.code, NOW).length === 0);
    }
  });

  it("still allows submission while the license is unexpired", () => {
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const valid: StageMoverCandidate = { ...readyClinical, licenseExpiry: future };
    const byCode = new Map(buildStageMoverOptions(valid, NOW).map((o) => [o.code, o]));
    expect(byCode.get("SUBMITTED_TO_CLIENT")!.valid).toBe(true);
  });
});
