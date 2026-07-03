import { describe, it, expect } from "vitest";
import { getAutoDisqualify } from "./disqualify";
import type { ClientRules, RuleCandidate } from "./types";

const sterling: ClientRules = {
  name: "Sterling Institute",
  states: ["CT"],
  creds: [],
  pops: [],
  settings: [],
};

const ok: RuleCandidate = {
  status: "NEW_CANDIDATE",
  track: "Clinical",
  licenseState: "CT",
  licenseStatus: "Active",
};

describe("getAutoDisqualify", () => {
  it("returns nothing for a clean candidate", () => {
    expect(getAutoDisqualify(ok, sterling)).toEqual([]);
  });

  it("disqualifies an expired license", () => {
    expect(getAutoDisqualify({ ...ok, licenseStatus: "Expired" }, sterling)).toContain(
      "License expired",
    );
  });

  it("disqualifies a license under investigation", () => {
    expect(getAutoDisqualify({ ...ok, licenseStatus: "Under Investigation" }, sterling)).toContain(
      "License under investigation",
    );
  });

  it("disqualifies a state mismatch with a descriptive reason", () => {
    const dq = getAutoDisqualify({ ...ok, licenseState: "NY" }, sterling);
    expect(dq).toContain("License state (NY) does not match Sterling Institute requirements (CT)");
  });

  it("skips the state check when there are no client rules", () => {
    expect(getAutoDisqualify({ ...ok, licenseState: "NY" }, null)).toEqual([]);
  });

  it("can return multiple reasons at once", () => {
    const dq = getAutoDisqualify({ ...ok, licenseState: "NY", licenseStatus: "Expired" }, sterling);
    expect(dq).toHaveLength(2);
    expect(dq).toContain("License expired");
    expect(dq[1]).toContain("does not match Sterling Institute");
  });
});
