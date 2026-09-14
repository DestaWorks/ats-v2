import { describe, it, expect } from "vitest";
import { scoreScreening, type ScreeningInput, type ScreeningClientRules } from "./screening";

const PMHNP_REQUIRED = [
  "Active RN License",
  "PMHNP Certification",
  "NP License",
  "DEA Registration",
  "Collaborative Agreement (if required by state)",
];
const PMHNP_PREFERRED = [
  "ANCC Board Certification",
  "Prescriptive Authority",
  "CPR/BLS",
  "Malpractice Insurance",
];

function baseInput(overrides: Partial<ScreeningInput> = {}): ScreeningInput {
  return {
    credential: "PMHNP",
    credentialsHeld: [],
    statesHeld: [],
    yearsExp: null,
    schedule: null,
    salaryAsk: null,
    commChecklist: [],
    ...overrides,
  };
}

describe("scoreScreening — credential section", () => {
  it("scores 0 for an unmapped/missing credential", () => {
    const out = scoreScreening(baseInput({ credential: "XYZ" }), null);
    expect(out.sections.cred).toBe(0);
  });

  it("scores 100 when all required + all preferred qualifications are held", () => {
    const out = scoreScreening(
      baseInput({ credentialsHeld: [...PMHNP_REQUIRED, ...PMHNP_PREFERRED] }),
      null,
    );
    expect(out.sections.cred).toBe(100);
  });

  it("weights required qualifications at 80% and preferred at 20%", () => {
    const out = scoreScreening(
      baseInput({
        credentialsHeld: [
          PMHNP_REQUIRED[0]!,
          PMHNP_REQUIRED[1]!,
          PMHNP_REQUIRED[2]!,
          PMHNP_PREFERRED[0]!,
          PMHNP_PREFERRED[1]!,
        ],
      }),
      null,
    );
    // 3/5 required * 80 + 2/4 preferred * 20 = 48 + 10 = 58
    expect(out.sections.cred).toBe(58);
  });
});

describe("scoreScreening — state section", () => {
  it("defaults to 50 when the client has no state requirement", () => {
    const out = scoreScreening(baseInput(), null);
    expect(out.sections.state).toBe(50);
  });

  it("scores the fraction of required states the candidate holds", () => {
    const rules: ScreeningClientRules = { states: ["CT", "NJ"], schedule: null };
    const out = scoreScreening(baseInput({ statesHeld: ["CT"] }), rules);
    expect(out.sections.state).toBe(50);
  });

  it("scores 100 when all required states are held", () => {
    const rules: ScreeningClientRules = { states: ["CT"], schedule: null };
    const out = scoreScreening(baseInput({ statesHeld: ["CT"] }), rules);
    expect(out.sections.state).toBe(100);
  });
});

describe("scoreScreening — experience section", () => {
  it("scores 100 at minYears + 3", () => {
    const out = scoreScreening(baseInput({ yearsExp: 5 }), null); // PMHNP minYears=2
    expect(out.sections.exp).toBe(100);
  });

  it("scores 60 at exactly minYears", () => {
    const out = scoreScreening(baseInput({ yearsExp: 2 }), null);
    expect(out.sections.exp).toBe(60);
  });

  it("scores between 60 and 100 for years between minYears and minYears+3", () => {
    const out = scoreScreening(baseInput({ yearsExp: 4 }), null);
    expect(out.sections.exp).toBe(87); // round(60 + (4-2)/3*40)
  });

  it("scores proportionally below minYears", () => {
    const out = scoreScreening(baseInput({ yearsExp: 1 }), null);
    expect(out.sections.exp).toBe(30); // round(1/2*60)
  });

  it("scores 0 at zero years", () => {
    const out = scoreScreening(baseInput({ yearsExp: 0 }), null);
    expect(out.sections.exp).toBe(0);
  });
});

describe("scoreScreening — schedule section", () => {
  it("scores 0 when unset", () => {
    const out = scoreScreening(baseInput({ schedule: null }), null);
    expect(out.sections.schedule).toBe(0);
  });

  it("scores 100 for Flexible regardless of the client", () => {
    const out = scoreScreening(baseInput({ schedule: "Flexible / Open to Anything" }), null);
    expect(out.sections.schedule).toBe(100);
  });

  it("scores 100 when the pick matches the client's schedule word", () => {
    const rules: ScreeningClientRules = { states: [], schedule: "Hybrid" };
    const out = scoreScreening(baseInput({ schedule: "Full-time Hybrid" }), rules);
    expect(out.sections.schedule).toBe(100);
  });

  it("scores 100 when both the pick and the client mention Hybrid", () => {
    const rules: ScreeningClientRules = { states: [], schedule: "3x12hr Hybrid shifts" };
    const out = scoreScreening(baseInput({ schedule: "Part-time Hybrid" }), rules);
    expect(out.sections.schedule).toBe(100);
  });

  it("falls back to 40 when the pick doesn't match a non-empty client schedule", () => {
    const rules: ScreeningClientRules = { states: [], schedule: "Hybrid" };
    const out = scoreScreening(baseInput({ schedule: "Telehealth Only" }), rules);
    expect(out.sections.schedule).toBe(40);
  });

  it("falls back to 40 when the client has no schedule set at all", () => {
    const rules: ScreeningClientRules = { states: [], schedule: null };
    const out = scoreScreening(baseInput({ schedule: "Full-time Hybrid" }), rules);
    expect(out.sections.schedule).toBe(40);
  });
});

describe("scoreScreening — salary section", () => {
  it("scores 0 when unset", () => {
    const out = scoreScreening(baseInput({ salaryAsk: null }), null);
    expect(out.sections.salary).toBe(0);
  });

  it("scores 100 within the credential's range", () => {
    const out = scoreScreening(baseInput({ salaryAsk: 140000 }), null); // PMHNP [120000,165000]
    expect(out.sections.salary).toBe(100);
  });

  it("falls off linearly below the range", () => {
    const out = scoreScreening(baseInput({ salaryAsk: 100000 }), null);
    expect(out.sections.salary).toBe(83); // round(100 - (120000-100000)/120000*100)
  });

  it("falls off linearly above the range", () => {
    const out = scoreScreening(baseInput({ salaryAsk: 200000 }), null);
    expect(out.sections.salary).toBe(79); // round(100 - (200000-165000)/165000*100)
  });
});

describe("scoreScreening — communication section", () => {
  it("scores 0 with nothing checked", () => {
    const out = scoreScreening(baseInput({ commChecklist: [] }), null);
    expect(out.sections.comm).toBe(0);
  });

  it("scores 100 with every item checked", () => {
    const out = scoreScreening(
      baseInput({
        commChecklist: [
          "respond24",
          "profEmail",
          "onTime",
          "clearEnglish",
          "preparedQuestions",
          "noRedFlags",
          "genuineInterest",
        ],
      }),
      null,
    );
    expect(out.sections.comm).toBe(100);
  });

  it("scores the fraction of items checked", () => {
    const out = scoreScreening(
      baseInput({
        commChecklist: ["respond24", "profEmail", "onTime", "clearEnglish", "preparedQuestions"],
      }),
      null,
    );
    expect(out.sections.comm).toBe(71); // round(5/7*100)
  });
});

describe("scoreScreening — weighted total + decision", () => {
  it("Advance: a perfect scorecard totals 100%", () => {
    const rules: ScreeningClientRules = { states: ["CT"], schedule: null };
    const out = scoreScreening(
      baseInput({
        credentialsHeld: [...PMHNP_REQUIRED, ...PMHNP_PREFERRED],
        statesHeld: ["CT"],
        yearsExp: 5,
        schedule: "Flexible / Open to Anything",
        salaryAsk: 140000,
        commChecklist: [
          "respond24",
          "profEmail",
          "onTime",
          "clearEnglish",
          "preparedQuestions",
          "noRedFlags",
          "genuineInterest",
        ],
      }),
      rules,
    );
    expect(out.totalPct).toBe(100);
    expect(out.decision).toBe("Advance");
  });

  it("Hold: an empty scorecard totals 0%", () => {
    const rules: ScreeningClientRules = { states: ["CT"], schedule: null };
    const out = scoreScreening(baseInput({ credential: "XYZ" }), rules);
    expect(out.totalPct).toBe(0);
    expect(out.decision).toBe("Hold");
  });

  it("Conditional: a mixed scorecard lands in the 60-74% band", () => {
    const rules: ScreeningClientRules = { states: ["CT", "NJ"], schedule: null };
    const out = scoreScreening(
      baseInput({
        credentialsHeld: [
          PMHNP_REQUIRED[0]!,
          PMHNP_REQUIRED[1]!,
          PMHNP_REQUIRED[2]!,
          PMHNP_PREFERRED[0]!,
          PMHNP_PREFERRED[1]!,
        ], // cred=58
        statesHeld: ["CT"], // state=50
        yearsExp: 2, // exp=60
        schedule: "Flexible / Open to Anything", // schedule=100
        salaryAsk: 140000, // salary=100
        commChecklist: ["respond24", "profEmail", "onTime", "clearEnglish", "preparedQuestions"], // comm=71
      }),
      rules,
    );
    expect(out.totalPct).toBe(69);
    expect(out.decision).toBe("Conditional");
  });
});
