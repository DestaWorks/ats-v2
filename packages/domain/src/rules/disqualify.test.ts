import { describe, it, expect } from "vitest";
import { getAutoDisqualify } from "./disqualify";
import { fixedClock } from "../clock";
import type { ClientRules, RuleCandidate } from "./types";

const sterling: ClientRules = {
  name: "Sterling Institute",
  states: ["CT"],
  creds: [],
  pops: [],
  settings: [],
};

const NOW = fixedClock("2026-08-21T12:00:00Z").now();

const ok: RuleCandidate = {
  status: "NEW_CANDIDATE",
  track: "Clinical",
  licenseState: "CT",
  licenseStatus: "Active",
};

describe("getAutoDisqualify", () => {
  it("returns nothing for a clean candidate", () => {
    expect(getAutoDisqualify(ok, sterling, NOW)).toEqual([]);
  });

  it("disqualifies an expired license", () => {
    expect(getAutoDisqualify({ ...ok, licenseStatus: "Expired" }, sterling, NOW)).toContain(
      "License expired",
    );
  });

  it("disqualifies a license under investigation", () => {
    expect(
      getAutoDisqualify({ ...ok, licenseStatus: "Under Investigation" }, sterling, NOW),
    ).toContain("License under investigation");
  });

  it("disqualifies a state mismatch with a descriptive reason", () => {
    const dq = getAutoDisqualify({ ...ok, licenseState: "NY" }, sterling, NOW);
    expect(dq).toContain("License state (NY) does not match Sterling Institute requirements (CT)");
  });

  it("skips the state check when there are no client rules", () => {
    expect(getAutoDisqualify({ ...ok, licenseState: "NY" }, null, NOW)).toEqual([]);
  });

  it("can return multiple reasons at once", () => {
    const dq = getAutoDisqualify(
      { ...ok, licenseState: "NY", licenseStatus: "Expired" },
      sterling,
      NOW,
    );
    expect(dq).toHaveLength(2);
    expect(dq).toContain("License expired");
    expect(dq[1]).toContain("does not match Sterling Institute");
  });
});
