import { describe, it, expect } from "vitest";
import { effectiveLicenseStatus, isLicenseLapsed } from "./license";
import { checkStageGate } from "./stage-gates";
import { getAutoDisqualify } from "./disqualify";
import { scoreCandidate } from "./scoring";
import type { ClientRules, RuleCandidate } from "./types";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const NOW = utc(2026, 8, 21);

const clinical: RuleCandidate = {
  status: "INITIAL_SCREENING",
  track: "Clinical",
  credential: "PMHNP",
  licenseState: "CT",
  licenseStatus: "Active",
  licenseExpiry: null,
  clientId: "client_1",
  email: "a@b.com",
  phone: null,
};

const rules: ClientRules = {
  name: "Sterling",
  states: ["CT"],
  creds: ["PMHNP"],
  pops: [],
  settings: [],
};

describe("effectiveLicenseStatus", () => {
  it("leaves a status with no expiry untouched", () => {
    expect(effectiveLicenseStatus(clinical, utc(2030, 1, 1))).toBe("Active");
  });

  it("keeps the license valid THROUGH its expiry date, not up to it", () => {
    const c = { ...clinical, licenseExpiry: utc(2026, 8, 21) };
    // 09:00 ET on the expiry date == 13:00 UTC the same day — still valid.
    expect(effectiveLicenseStatus(c, new Date("2026-08-21T13:00:00Z"))).toBe("Active");
    // The last instant of the expiry day.
    expect(effectiveLicenseStatus(c, new Date("2026-08-21T23:59:59Z"))).toBe("Active");
    // The following UTC day — now lapsed.
    expect(effectiveLicenseStatus(c, new Date("2026-08-22T00:00:00Z"))).toBe("Expired");
  });

  it("demotes a long-lapsed Active license", () => {
    const c = { ...clinical, licenseExpiry: utc(2026, 3, 1) };
    expect(effectiveLicenseStatus(c, utc(2026, 8, 21))).toBe("Expired");
    expect(isLicenseLapsed(c, utc(2026, 8, 21))).toBe(true);
  });

  it("only demotes Active — a future expiry never promotes a non-Active status", () => {
    for (const status of ["Not Verified", "Expired", "Under Investigation", "Not Found"] as const) {
      const c = { ...clinical, licenseStatus: status, licenseExpiry: utc(2030, 1, 1) };
      expect(effectiveLicenseStatus(c, utc(2026, 8, 21))).toBe(status);
      expect(isLicenseLapsed(c, utc(2026, 8, 21))).toBe(false);
    }
  });
});

describe("a lapsed license behaves exactly like a manual Expired", () => {
  const lapsed: RuleCandidate = { ...clinical, licenseExpiry: utc(2026, 3, 1) };
  const now = utc(2026, 8, 21);

  it("blocks the submit-to-client gate", () => {
    expect(checkStageGate(clinical, "SUBMITTED_TO_CLIENT", now)).toEqual([]);
    expect(checkStageGate(lapsed, "SUBMITTED_TO_CLIENT", now)).toContain("License must be Active");
  });

  it("auto-disqualifies", () => {
    expect(getAutoDisqualify(clinical, rules, now)).toEqual([]);
    expect(getAutoDisqualify(lapsed, rules, now)).toContain("License expired");
  });

  it("forfeits the 10 license points and flags", () => {
    expect(scoreCandidate(clinical, rules, now).score).toBe(70);
    const scored = scoreCandidate(lapsed, rules, now);
    expect(scored.score).toBe(60);
    expect(scored.max).toBe(70);
    expect(scored.flags).toContain("License expired");
  });
});

describe('"Not Found" is treated as unverified, not as a pass', () => {
  it("blocks the screening gate the same way Not Verified does", () => {
    const notFound = { ...clinical, licenseStatus: "Not Found" as const };
    const notVerified = { ...clinical, licenseStatus: "Not Verified" as const };
    const expected = ["License must be verified first"];
    expect(checkStageGate(notFound, "INITIAL_SCREENING", NOW)).toEqual(expected);
    expect(checkStageGate(notVerified, "INITIAL_SCREENING", NOW)).toEqual(expected);
  });

  it("still blocks the submit gate", () => {
    const notFound = { ...clinical, licenseStatus: "Not Found" as const };
    expect(checkStageGate(notFound, "SUBMITTED_TO_CLIENT", NOW)).toContain(
      "License must be Active",
    );
  });

  it("does not gate the Operations track on any license status", () => {
    const ops: RuleCandidate = {
      ...clinical,
      track: "Operations",
      licenseStatus: "Not Found",
      licenseExpiry: utc(2020, 1, 1),
    };
    expect(checkStageGate(ops, "INITIAL_SCREENING", NOW)).toEqual([]);
    expect(checkStageGate(ops, "SUBMITTED_TO_CLIENT", NOW)).toEqual([]);
  });
});
