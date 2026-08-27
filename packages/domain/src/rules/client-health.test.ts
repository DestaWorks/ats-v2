import { describe, expect, it } from "vitest";
import { computeHealthScore } from "./client-health";

describe("computeHealthScore — pipeline factor (0-40)", () => {
  it("scales linearly at 8 points per active candidate, capped at 40", () => {
    const zero = computeHealthScore({
      activeCandidateCount: 0,
      daysSinceLastTouch: 0,
      doneTaskCount: 0,
      totalTaskCount: 0,
    });
    expect(zero.breakdown.pipeline).toBe(0);

    const three = computeHealthScore({
      activeCandidateCount: 3,
      daysSinceLastTouch: 0,
      doneTaskCount: 0,
      totalTaskCount: 0,
    });
    expect(three.breakdown.pipeline).toBe(24);

    const capped = computeHealthScore({
      activeCandidateCount: 10,
      daysSinceLastTouch: 0,
      doneTaskCount: 0,
      totalTaskCount: 0,
    });
    expect(capped.breakdown.pipeline).toBe(40);
  });
});

describe("computeHealthScore — communication factor (0-35)", () => {
  const base = { activeCandidateCount: 0, doneTaskCount: 0, totalTaskCount: 0 };

  it("scores by recency tier: <=7d, <=14d, <=30d, >30d", () => {
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 0 }).breakdown.communication).toBe(35);
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 7 }).breakdown.communication).toBe(35);
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 8 }).breakdown.communication).toBe(25);
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 14 }).breakdown.communication).toBe(
      25,
    );
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 15 }).breakdown.communication).toBe(
      12,
    );
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 30 }).breakdown.communication).toBe(
      12,
    );
    expect(computeHealthScore({ ...base, daysSinceLastTouch: 31 }).breakdown.communication).toBe(0);
  });

  it("uses a documented, less-generous 'no data' default (15, not ~50% of max) when never touched", () => {
    const result = computeHealthScore({ ...base, daysSinceLastTouch: null });
    expect(result.breakdown.communication).toBe(15);
  });
});

describe("computeHealthScore — tasks factor (0-25)", () => {
  const base = { activeCandidateCount: 0, daysSinceLastTouch: null };

  it("scales by completion ratio", () => {
    expect(
      computeHealthScore({ ...base, doneTaskCount: 4, totalTaskCount: 4 }).breakdown.tasks,
    ).toBe(25);
    expect(
      computeHealthScore({ ...base, doneTaskCount: 2, totalTaskCount: 4 }).breakdown.tasks,
    ).toBe(13); // round(0.5 * 25)
    expect(
      computeHealthScore({ ...base, doneTaskCount: 0, totalTaskCount: 4 }).breakdown.tasks,
    ).toBe(0);
  });

  it("defaults to 12 (not 0, not full marks) when there are zero tasks logged", () => {
    expect(
      computeHealthScore({ ...base, doneTaskCount: 0, totalTaskCount: 0 }).breakdown.tasks,
    ).toBe(12);
  });
});

describe("computeHealthScore — tier bucketing", () => {
  it("Healthy >=75, Needs Attention >=50, At Risk below", () => {
    // pipeline 40 + communication 35 + tasks 25 = 100
    expect(
      computeHealthScore({
        activeCandidateCount: 10,
        daysSinceLastTouch: 0,
        doneTaskCount: 1,
        totalTaskCount: 1,
      }).tier,
    ).toBe("Healthy");

    // pipeline 8 + communication 25 + tasks 25 = 58 -> Needs Attention
    expect(
      computeHealthScore({
        activeCandidateCount: 1,
        daysSinceLastTouch: 10,
        doneTaskCount: 1,
        totalTaskCount: 1,
      }).tier,
    ).toBe("Needs Attention");

    // everything zero/no-data: pipeline 0 + communication 15 + tasks 12 = 27 -> At Risk
    expect(
      computeHealthScore({
        activeCandidateCount: 0,
        daysSinceLastTouch: null,
        doneTaskCount: 0,
        totalTaskCount: 0,
      }).tier,
    ).toBe("At Risk");
  });

  it("score is the sum of the 3 breakdown factors", () => {
    const result = computeHealthScore({
      activeCandidateCount: 2,
      daysSinceLastTouch: 5,
      doneTaskCount: 1,
      totalTaskCount: 2,
    });
    const sum = result.breakdown.pipeline + result.breakdown.communication + result.breakdown.tasks;
    expect(result.score).toBe(sum);
  });
});
