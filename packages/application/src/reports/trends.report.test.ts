import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `trendsReport.trends` — Wave 5.2 flex. Covers the anomaly-detection thresholds (legacy: skip
 * noise below 5 on both sides; flag "new" at lastWeek=0 && thisWeek>=10; else flag at >=30% WoW)
 * and the funnel's conversion-%-of-preceding-stage math, using a deterministic total per metric.
 */

const h = vi.hoisted(() => ({
  sourcedCountsByRange: vi.fn(),
  outreachCountsByRange: vi.fn(),
  responseCountsByRange: vi.fn(),
  promotedCountsByRange: vi.fn(),
  targetsForDateRange: vi.fn(),
  enteredStatusCountsByRange: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/daily.repository", () => ({
  dailyRepository: {
    sourcedCountsByRange: h.sourcedCountsByRange,
    outreachCountsByRange: h.outreachCountsByRange,
    responseCountsByRange: h.responseCountsByRange,
    promotedCountsByRange: h.promotedCountsByRange,
    targetsForDateRange: h.targetsForDateRange,
  },
}));
vi.mock("@destaworks/db/repositories/stage-history.repository", () => ({
  stageHistoryRepository: { enteredStatusCountsByRange: h.enteredStatusCountsByRange },
}));

import { trendsReport } from "./trends.report";

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.targetsForDateRange.mockResolvedValue([]);
});

describe("trendsReport.trends — anomaly detection", () => {
  it("does not flag a metric moving <30% WoW", async () => {
    // sourced: 10 -> 12 (20% up), everything else flat at 0 across all calls.
    let call = 0;
    h.sourcedCountsByRange.mockImplementation(async () => {
      call++;
      // call order: thisWeek, lastWeek, thisMonth, lastMonth, thisQuarter, lastQuarter
      const totals = [12, 10, 12, 10, 12, 10];
      return new Map([["u1", totals[call - 1]]]);
    });
    h.outreachCountsByRange.mockResolvedValue(new Map());
    h.responseCountsByRange.mockResolvedValue(new Map());
    h.promotedCountsByRange.mockResolvedValue(new Map());
    h.enteredStatusCountsByRange.mockResolvedValue(new Map());

    const dto = await trendsReport.trends();
    expect(dto.anomalies.find((a) => a.label === "Sourced")).toBeUndefined();
  });

  it("flags a metric moving >=30% WoW when volume clears the noise floor", async () => {
    let call = 0;
    h.sourcedCountsByRange.mockImplementation(async () => {
      call++;
      const totals = [20, 10, 20, 10, 20, 10]; // 100% WoW increase
      return new Map([["u1", totals[call - 1]]]);
    });
    h.outreachCountsByRange.mockResolvedValue(new Map());
    h.responseCountsByRange.mockResolvedValue(new Map());
    h.promotedCountsByRange.mockResolvedValue(new Map());
    h.enteredStatusCountsByRange.mockResolvedValue(new Map());

    const dto = await trendsReport.trends();
    const anomaly = dto.anomalies.find((a) => a.label === "Sourced");
    expect(anomaly).toMatchObject({
      direction: "up",
      thisWeek: 20,
      lastWeek: 10,
      changeLabel: "100%",
    });
  });

  it("skips a metric under the noise floor even with a large relative swing", async () => {
    let call = 0;
    h.sourcedCountsByRange.mockImplementation(async () => {
      call++;
      const totals = [2, 1, 2, 1, 2, 1]; // 100% WoW, but both sides < 5 (noise floor)
      return new Map([["u1", totals[call - 1]]]);
    });
    h.outreachCountsByRange.mockResolvedValue(new Map());
    h.responseCountsByRange.mockResolvedValue(new Map());
    h.promotedCountsByRange.mockResolvedValue(new Map());
    h.enteredStatusCountsByRange.mockResolvedValue(new Map());

    const dto = await trendsReport.trends();
    expect(dto.anomalies.find((a) => a.label === "Sourced")).toBeUndefined();
  });

  it('flags "new" when lastWeek was 0 and thisWeek clears the new-activity threshold', async () => {
    let call = 0;
    h.sourcedCountsByRange.mockImplementation(async () => {
      call++;
      const totals = [10, 0, 10, 0, 10, 0];
      return new Map([["u1", totals[call - 1]]]);
    });
    h.outreachCountsByRange.mockResolvedValue(new Map());
    h.responseCountsByRange.mockResolvedValue(new Map());
    h.promotedCountsByRange.mockResolvedValue(new Map());
    h.enteredStatusCountsByRange.mockResolvedValue(new Map());

    const dto = await trendsReport.trends();
    const anomaly = dto.anomalies.find((a) => a.label === "Sourced");
    expect(anomaly).toMatchObject({ direction: "up", changeLabel: "new" });
  });
});

describe("trendsReport.trends — funnel", () => {
  it("computes each stage's conversion % relative to the PRECEDING stage, same period", async () => {
    h.sourcedCountsByRange.mockResolvedValue(new Map([["u1", 100]]));
    h.outreachCountsByRange.mockResolvedValue(new Map([["u1", 50]]));
    h.responseCountsByRange.mockResolvedValue(new Map([["u1", 10]]));
    h.promotedCountsByRange.mockResolvedValue(new Map());
    h.enteredStatusCountsByRange.mockImplementation(async (toStatus: string) => {
      if (toStatus === "SUBMITTED_TO_CLIENT") return new Map([["u1", 5]]);
      if (toStatus === "STARTED_DAY1") return new Map([["u1", 1]]);
      return new Map();
    });

    const dto = await trendsReport.trends();
    const bySourced = dto.funnel.find((f) => f.label === "Sourced")!;
    const byOutreach = dto.funnel.find((f) => f.label === "Outreach")!;
    expect(bySourced.convCurrPct).toBeNull(); // first stage has no preceding stage
    expect(byOutreach.convCurrPct).toBe(50); // 50/100
  });
});
