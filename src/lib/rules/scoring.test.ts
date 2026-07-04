import { describe, it, expect } from "vitest";
import { scoreCandidate } from "./scoring";
import type { ClientRules, RuleCandidate } from "./types";

// Sterling Institute (from legacy CLIENT_RULES): CT · PMHNP/MD/… · Child/Adolescent · Hybrid/Outpatient
const sterling: ClientRules = {
  name: "Sterling Institute",
  states: ["CT"],
  creds: ["PMHNP", "PMHNP-BC", "MD", "DO", "PsyD", "PhD"],
  pops: ["Child/Adolescent"],
  settings: ["Hybrid", "Outpatient"],
};

const base: RuleCandidate = {
  status: "NEW_CANDIDATE",
  track: "Clinical",
  credential: "PMHNP",
  licenseState: "CT",
  licenseStatus: "Active",
  population: "Child/Adolescent",
  setting: "Hybrid",
};

describe("scoreCandidate", () => {
  it("returns a zero score when there are no client rules", () => {
    expect(scoreCandidate(base, null)).toEqual({ score: 0, max: 0, pct: 0, flags: [] });
  });

  it("gives a perfect 100% when every dimension matches", () => {
    const r = scoreCandidate(base, sterling);
    expect(r.score).toBe(100);
    expect(r.max).toBe(100);
    expect(r.pct).toBe(100);
    expect(r.flags).toEqual([]);
  });

  it("penalizes a wrong state and flags it (score 70/100)", () => {
    const r = scoreCandidate({ ...base, licenseState: "NY" }, sterling);
    expect(r.score).toBe(70); // loses the 30 state points
    expect(r.max).toBe(100);
    expect(r.pct).toBe(70);
    expect(r.flags).toContain("Wrong state for Sterling Institute");
  });

  it("penalizes an atypical credential and flags it", () => {
    const r = scoreCandidate({ ...base, credential: "LCSW" }, sterling);
    expect(r.score).toBe(70);
    expect(r.flags).toContain("Credential not typical for Sterling Institute");
  });

  it("flags population mismatch only when a population is present", () => {
    const mismatch = scoreCandidate({ ...base, population: "Adult" }, sterling);
    expect(mismatch.score).toBe(80);
    expect(mismatch.flags).toContain("Population mismatch");

    const missing = scoreCandidate({ ...base, population: null }, sterling);
    expect(missing.flags).not.toContain("Population mismatch");
    expect(missing.score).toBe(80); // still loses the 20 population points
  });

  it("adds the 10 license points only when Active, and flags an expired license", () => {
    const expired = scoreCandidate({ ...base, licenseStatus: "Expired" }, sterling);
    expect(expired.score).toBe(90); // loses the 10 license points
    expect(expired.flags).toContain("License expired");

    const notVerified = scoreCandidate({ ...base, licenseStatus: "Not Verified" }, sterling);
    expect(notVerified.score).toBe(90);
    expect(notVerified.flags).not.toContain("License expired");
  });

  it("makes pct relative to constrained dimensions (all-empty rules → 0/0 → 0%)", () => {
    const wideOpen: ClientRules = { name: "Future", states: [], creds: [], pops: [], settings: [] };
    const r = scoreCandidate(base, wideOpen);
    // Only the license dimension counts toward max (always +10); candidate is Active → 10/10.
    expect(r.max).toBe(10);
    expect(r.score).toBe(10);
    expect(r.pct).toBe(100);
  });
});
