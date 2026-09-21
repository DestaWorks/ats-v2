import { describe, it, expect } from "vitest";
import { nextActionsFor, rankNextActions, type NextActionCandidate } from "./next-actions";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function candidate(overrides: Partial<NextActionCandidate> = {}): NextActionCandidate {
  return {
    id: "c1",
    name: "Jane Doe",
    status: "NEW_CANDIDATE",
    track: "Clinical",
    stageEnteredAt: NOW,
    licenseStatus: "Active",
    licenseState: "NJ",
    licenseExpiry: null,
    ...overrides,
  };
}

describe("nextActionsFor — nudges", () => {
  it("raises a nudge when the client has sat past the stage SLA", () => {
    const actions = nextActionsFor(
      candidate({ status: "SUBMITTED_TO_CLIENT", stageEnteredAt: daysAgo(52) }),
      NOW,
    );
    const nudge = actions.find((a) => a.type === "NUDGE");
    expect(nudge?.priority).toBe("P1");
    expect(nudge?.daysInStage).toBe(52);
    expect(nudge?.reason).toContain("52 days");
  });

  it("raises no nudge while the client is still inside the SLA", () => {
    const actions = nextActionsFor(
      candidate({ status: "SUBMITTED_TO_CLIENT", stageEnteredAt: daysAgo(2) }),
      NOW,
    );
    expect(actions.map((a) => a.type)).not.toContain("NUDGE");
  });

  it("never nudges on a stage where the ball is ours, however long it has sat", () => {
    // Chasing the client about a candidate WE have not submitted is chasing ourselves.
    const actions = nextActionsFor(
      candidate({ status: "DESTA_REVIEW", stageEnteredAt: daysAgo(90) }),
      NOW,
    );
    expect(actions.map((a) => a.type)).not.toContain("NUDGE");
  });
});

describe("nextActionsFor — stale", () => {
  it("flags a pre-client stage past the stuck threshold", () => {
    const actions = nextActionsFor(
      candidate({ status: "QUALIFIED_PRESCREEN", stageEnteredAt: daysAgo(41) }),
      NOW,
    );
    const stale = actions.find((a) => a.type === "STALE");
    expect(stale).toBeDefined();
    expect(stale?.reason).toContain("41 days");
  });

  it("is P1 once it is also past the SLA, P2 while merely slipping", () => {
    // QUALIFIED_PRESCREEN has a 2-day SLA and the stuck threshold is 7 days, so 8 days is both.
    const both = nextActionsFor(
      candidate({ status: "QUALIFIED_PRESCREEN", stageEnteredAt: daysAgo(8) }),
      NOW,
    );
    expect(both.find((a) => a.type === "STALE")?.priority).toBe("P1");
  });

  it("does not flag a candidate who has only just arrived in the stage", () => {
    const actions = nextActionsFor(
      candidate({ status: "QUALIFIED_PRESCREEN", stageEnteredAt: daysAgo(3) }),
      NOW,
    );
    expect(actions.map((a) => a.type)).not.toContain("STALE");
  });
});

describe("nextActionsFor — verification", () => {
  it("asks for verification when the licence was never verified", () => {
    const actions = nextActionsFor(candidate({ licenseStatus: "Not Verified" }), NOW);
    const verify = actions.find((a) => a.type === "VERIFY");
    expect(verify?.priority).toBe("P3");
    expect(verify?.reason).toContain("NJ licence");
  });

  it("ranks a LAPSED licence above a never-verified one", () => {
    // The distinction that matters: this candidate was advanceable yesterday and is not today,
    // so work already done is at risk. A missing check has cost nothing yet.
    const lapsed = nextActionsFor(
      candidate({ licenseStatus: "Active", licenseExpiry: daysAgo(10) }),
      NOW,
    );
    expect(lapsed.find((a) => a.type === "VERIFY")?.priority).toBe("P2");
  });

  it("asks nothing of a verified, unexpired licence", () => {
    const actions = nextActionsFor(candidate({ licenseExpiry: new Date("2030-01-01") }), NOW);
    expect(actions.map((a) => a.type)).not.toContain("VERIFY");
  });

  it("never asks an Operations candidate for a licence they do not hold", () => {
    const actions = nextActionsFor(
      candidate({ track: "Operations", licenseStatus: "Not Verified" }),
      NOW,
    );
    expect(actions.map((a) => a.type)).not.toContain("VERIFY");
  });
});

describe("nextActionsFor — composition", () => {
  it("returns BOTH a stale and a verify for one candidate — they are separate work", () => {
    const actions = nextActionsFor(
      candidate({
        status: "QUALIFIED_PRESCREEN",
        stageEnteredAt: daysAgo(41),
        licenseStatus: "Not Verified",
      }),
      NOW,
    );
    expect(actions.map((a) => a.type).sort()).toEqual(["STALE", "VERIFY"]);
  });

  it("proposes nothing for a terminal candidate", () => {
    const actions = nextActionsFor(
      candidate({
        status: "CLIENT_REJECTED",
        stageEnteredAt: daysAgo(200),
        licenseStatus: "Not Verified",
      }),
      NOW,
    );
    expect(actions).toEqual([]);
  });
});

describe("rankNextActions", () => {
  it("orders worst first, then longest-waiting, then by name", () => {
    const ranked = rankNextActions([
      ...nextActionsFor(candidate({ id: "b", name: "Bob", licenseStatus: "Not Verified" }), NOW),
      ...nextActionsFor(
        candidate({
          id: "a",
          name: "Alice",
          status: "SUBMITTED_TO_CLIENT",
          stageEnteredAt: daysAgo(52),
        }),
        NOW,
      ),
      ...nextActionsFor(
        candidate({
          id: "c",
          name: "Carol",
          status: "QUALIFIED_PRESCREEN",
          stageEnteredAt: daysAgo(9),
          licenseExpiry: new Date("2030-01-01"),
        }),
        NOW,
      ),
    ]);

    expect(ranked.map((a) => a.priority)).toEqual(["P1", "P1", "P3"]);
    // Both P1s: the 52-day wait outranks the 9-day one.
    expect(ranked[0]!.candidateName).toBe("Alice");
  });

  it("does not mutate the input", () => {
    const actions = nextActionsFor(candidate({ licenseStatus: "Not Verified" }), NOW);
    const copy = [...actions];
    rankNextActions(actions);
    expect(actions).toEqual(copy);
  });
});
