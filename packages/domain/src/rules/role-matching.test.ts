import { describe, it, expect } from "vitest";
import {
  DEFAULT_MATCH_WEIGHTS,
  dormantMatchesForRole,
  isStrongMatch,
  matchesForRole,
  scoreDormantMatch,
  scoreRoleMatch,
  triageScore,
  type RuleLead,
  type RuleRole,
} from "./role-matching";

const role: RuleRole = { clientId: "c1", state: "NJ", credential: "PMHNP" };

const hotLead: RuleLead = {
  targetClientId: "c1",
  state: "NJ",
  credential: "PMHNP",
  status: "Responded — Hot",
};

describe("scoreRoleMatch", () => {
  it("adds every dimension + the Hot bonus for a perfect match", () => {
    // 30 client + 25 state + 25 cred exact + 20 hot = 100
    expect(scoreRoleMatch(role, hotLead, DEFAULT_MATCH_WEIGHTS)).toBe(100);
  });

  it("hard-excludes Promoted and Bad Fit leads regardless of fit", () => {
    expect(scoreRoleMatch(role, { ...hotLead, status: "Promoted" }, DEFAULT_MATCH_WEIGHTS)).toBe(
      -1,
    );
    expect(scoreRoleMatch(role, { ...hotLead, status: "Bad Fit" }, DEFAULT_MATCH_WEIGHTS)).toBe(-1);
  });

  it("gives partial credential credit on substring overlap, not exact credit", () => {
    const partial = scoreRoleMatch(
      role,
      { ...hotLead, credential: "PMHNP-BC" },
      DEFAULT_MATCH_WEIGHTS,
    );
    // 30 + 25 + 15 (partial) + 20 = 90
    expect(partial).toBe(90);
  });

  it("uses the outreach bonus for Outreach 1/2/3 and the sourced bonus for Sourced", () => {
    expect(scoreRoleMatch(role, { ...hotLead, status: "Outreach 2" }, DEFAULT_MATCH_WEIGHTS)).toBe(
      30 + 25 + 25 + 10,
    );
    expect(scoreRoleMatch(role, { ...hotLead, status: "Sourced" }, DEFAULT_MATCH_WEIGHTS)).toBe(
      30 + 25 + 25 + 5,
    );
  });

  it("applies the cold penalty for Responded — Cold and No Response, no other bonus", () => {
    expect(
      scoreRoleMatch(role, { ...hotLead, status: "Responded — Cold" }, DEFAULT_MATCH_WEIGHTS),
    ).toBe(30 + 25 + 25 - 10);
    expect(scoreRoleMatch(role, { ...hotLead, status: "No Response" }, DEFAULT_MATCH_WEIGHTS)).toBe(
      30 + 25 + 25 - 10,
    );
  });

  it("gives Future Collaboration no bonus and no penalty", () => {
    expect(
      scoreRoleMatch(role, { ...hotLead, status: "Future Collaboration" }, DEFAULT_MATCH_WEIGHTS),
    ).toBe(30 + 25 + 25);
  });

  it("scores nothing for a mismatched client/state/credential", () => {
    const noMatch = scoreRoleMatch(
      role,
      { targetClientId: "other", state: "CA", credential: "LCSW", status: "Sourced" },
      DEFAULT_MATCH_WEIGHTS,
    );
    expect(noMatch).toBe(5); // only the Sourced bonus
  });
});

describe("matchesForRole", () => {
  it("filters below minScore, sorts best-first, and caps at limit", () => {
    const leads: RuleLead[] = [
      hotLead, // 100
      { ...hotLead, credential: "LCSW", status: "Sourced" }, // 30+25+0+5 = 60
      { targetClientId: null, state: null, credential: null, status: "Promoted" }, // excluded
      { targetClientId: null, state: null, credential: null, status: "No Response" }, // 0-10 = -10, below minScore
    ];
    const matches = matchesForRole(role, leads, DEFAULT_MATCH_WEIGHTS, 1);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.score).toBe(100);
  });
});

describe("scoreDormantMatch / dormantMatchesForRole", () => {
  it("only considers No Response / Responded — Cold / Future Collaboration leads", () => {
    expect(scoreDormantMatch(role, { ...hotLead, status: "Responded — Hot" })).toBe(-1);
    expect(scoreDormantMatch(role, { ...hotLead, status: "Sourced" })).toBe(-1);
    expect(scoreDormantMatch(role, { ...hotLead, status: "No Response" })).toBe(30 + 25 + 25);
  });

  it("uses fixed weights independent of any client profile", () => {
    const dormantLead: RuleLead = { ...hotLead, status: "Responded — Cold" };
    const matches = dormantMatchesForRole(role, [dormantLead]);
    expect(matches[0]?.score).toBe(30 + 25 + 25);
  });
});

describe("triageScore", () => {
  const now = new Date("2026-07-14T00:00:00Z");

  it("badges HOT when there is at least one hot match, regardless of staleness", () => {
    const r = triageScore(
      { status: "Open", priority: "P3", openedAt: new Date("2026-07-13T00:00:00Z") },
      0,
      1,
      now,
    );
    expect(r.badge).toBe("HOT");
  });

  it("badges STALE at 21+ days open with no hot match", () => {
    const r = triageScore(
      { status: "Open", priority: "P2", openedAt: new Date("2026-06-20T00:00:00Z") },
      0,
      0,
      now,
    );
    expect(r.daysOpen).toBeGreaterThanOrEqual(21);
    expect(r.badge).toBe("STALE");
  });

  it("badges GAP for a P1 role with zero strong matches (and not yet stale)", () => {
    const r = triageScore(
      { status: "Open", priority: "P1", openedAt: new Date("2026-07-10T00:00:00Z") },
      0,
      0,
      now,
    );
    expect(r.badge).toBe("GAP");
  });

  it("badges EASY for 3+ strong matches within a week", () => {
    const r = triageScore(
      { status: "Open", priority: "P2", openedAt: new Date("2026-07-10T00:00:00Z") },
      3,
      0,
      now,
    );
    expect(r.badge).toBe("EASY");
  });

  it("falls back to the priority badge otherwise", () => {
    const r = triageScore(
      { status: "Open", priority: "P3", openedAt: new Date("2026-07-13T00:00:00Z") },
      0,
      0,
      now,
    );
    expect(r.badge).toBe("P3");
  });

  it("applies the On Hold penalty to score but not to badge logic", () => {
    const opened = new Date("2026-07-13T00:00:00Z");
    const open = triageScore({ status: "Open", priority: "P2", openedAt: opened }, 0, 0, now);
    const onHold = triageScore({ status: "On Hold", priority: "P2", openedAt: opened }, 0, 0, now);
    expect(onHold.score).toBe(open.score - 15);
  });
});

describe("isStrongMatch", () => {
  it("is true at and above 50, false below", () => {
    expect(isStrongMatch(50)).toBe(true);
    expect(isStrongMatch(49)).toBe(false);
  });
});
