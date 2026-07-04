import { describe, expect, it } from "vitest";
import { checkStageGate } from "@/lib/rules/stage-gates";
import {
  buildStageMoverOptions,
  toRuleCandidate,
  type StageMoverCandidate,
} from "./stage-mover-options";

/** A clinical candidate missing the license/credential the early gates require. */
const bareClinical: StageMoverCandidate = {
  status: "NEW_CANDIDATE",
  track: "Clinical",
  credential: null,
  licenseState: null,
  licenseStatus: "Not Verified",
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
  population: "Adult",
  setting: "Telehealth",
  clientId: "client-1",
  email: "a@b.com",
  phone: "555-0100",
};

describe("buildStageMoverOptions", () => {
  it("emits one option per pipeline status and marks the current stage", () => {
    const opts = buildStageMoverOptions(bareClinical);
    expect(opts).toHaveLength(13);
    const current = opts.filter((o) => o.current);
    expect(current).toHaveLength(1);
    expect(current[0]?.code).toBe("NEW_CANDIDATE");
    // The current stage is never gate-flagged (staying put is a no-op).
    expect(current[0]?.valid).toBe(true);
    expect(current[0]?.reasons).toEqual([]);
  });

  it("flags gated targets as INVALID with the gate's reasons for an unqualified candidate", () => {
    const opts = buildStageMoverOptions(bareClinical);
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
      expect(o.valid).toBe(checkStageGate(toRuleCandidate(bareClinical), o.code).length === 0);
    }
  });

  it("marks gated targets VALID once the candidate satisfies the gates", () => {
    const opts = buildStageMoverOptions(readyClinical);
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
    const byCode = new Map(buildStageMoverOptions(ops).map((o) => [o.code, o]));
    // Operations needs only contact info — no credential/license gate blocks the pre-screen.
    expect(byCode.get("QUALIFIED_PRESCREEN")!.valid).toBe(true);
    expect(byCode.get("SUBMITTED_TO_CLIENT")!.reasons).toContain("Client assignment required");
  });
});
