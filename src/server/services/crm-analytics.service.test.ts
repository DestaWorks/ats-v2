import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `crmAnalyticsService` — Wave 4.2 flex. Covers Revenue's edge cases (no contract yet → nulls,
 * not-invented numbers) and the load-bearing consistency guarantee: `compare()` must produce the
 * SAME health score for a client as `healthScore()` does — the actual fix for legacy's 3
 * independently-drifted health formulas (Overview / Compare "Quick Health" / Churn-Risk %).
 */

const h = vi.hoisted(() => ({
  findByIdClient: vi.fn(),
  listClients: vi.fn(),
  groupByStatusFiltered: vi.fn(),
  groupByStatusForClients: vi.fn(),
  listNotes: vi.fn(),
  listNotesForClients: vi.fn(),
  listMeetings: vi.fn(),
  listMeetingsForClients: vi.fn(),
  listTasks: vi.fn(),
  listTasksForClients: vi.fn(),
  listDeals: vi.fn(),
  listDealsForClients: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/client.repository", () => ({
  clientRepository: { findById: h.findByIdClient, list: h.listClients },
}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: {
    groupByStatusFiltered: h.groupByStatusFiltered,
    groupByStatusForClients: h.groupByStatusForClients,
  },
  FIRST_TERMINAL_ORDER: 9,
}));
vi.mock("@/server/repositories/client-note.repository", () => ({
  clientNoteRepository: { listForClient: h.listNotes, listForClients: h.listNotesForClients },
}));
vi.mock("@/server/repositories/client-meeting.repository", () => ({
  clientMeetingRepository: {
    listForClient: h.listMeetings,
    listForClients: h.listMeetingsForClients,
  },
}));
vi.mock("@/server/repositories/client-task.repository", () => ({
  clientTaskRepository: { listForClient: h.listTasks, listForClients: h.listTasksForClients },
}));
vi.mock("@/server/repositories/deal.repository", () => ({
  dealRepository: { listForClient: h.listDeals, listForClients: h.listDealsForClients },
}));

import { crmAnalyticsService } from "./crm-analytics.service";

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Acme",
    monthlyRate: null,
    avgPlacementFee: null,
    grossMargin: null,
    contractStart: null,
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.listNotes.mockResolvedValue([]);
  h.listNotesForClients.mockResolvedValue([]);
  h.listMeetings.mockResolvedValue([]);
  h.listMeetingsForClients.mockResolvedValue([]);
  h.listTasks.mockResolvedValue([]);
  h.listTasksForClients.mockResolvedValue([]);
  h.listDeals.mockResolvedValue([]);
  h.listDealsForClients.mockResolvedValue([]);
  h.groupByStatusFiltered.mockResolvedValue([]);
  h.groupByStatusForClients.mockResolvedValue([]);
});

describe("crmAnalyticsService.revenue", () => {
  it("returns nulls for every projected figure when there's no contractStart yet — never invents numbers", async () => {
    h.findByIdClient.mockResolvedValue(clientRow({ monthlyRate: 5000, avgPlacementFee: 20000 }));
    const dto = await crmAnalyticsService.revenue("c1");
    expect(dto.placementsPerYear).toBeNull();
    expect(dto.annualizedRevenue).toBeNull();
    expect(dto.grossProfit).toBeNull();
    expect(dto.roiPerHour).toBeNull();
    expect(dto.lifetimeCumulative).toBeNull();
  });

  it("computes annualized revenue and gross profit from monthly rate + placement fee + margin", async () => {
    const oneYearAgo = new Date(Date.now() - 365 * 86_400_000);
    h.findByIdClient.mockResolvedValue(
      clientRow({
        monthlyRate: 1000,
        avgPlacementFee: 10000,
        grossMargin: 50,
        contractStart: oneYearAgo,
      }),
    );
    h.groupByStatusFiltered.mockResolvedValue([{ status: "STARTED_DAY1", _count: { _all: 2 } }]);

    const dto = await crmAnalyticsService.revenue("c1");
    // retainerARR = 1000*12 = 12000; placementsPerYear ≈ 2; placementARR ≈ 2*10000 = 20000
    expect(dto.annualizedRevenue).toBeCloseTo(32000, -2);
    expect(dto.grossProfit).toBeCloseTo(16000, -2); // 50% margin
  });
});

describe("crmAnalyticsService — health score consistency (the actual bug fix)", () => {
  it("compare() reports the IDENTICAL score/tier for a client as healthScore() does", async () => {
    h.findByIdClient.mockResolvedValue(clientRow());
    h.listClients.mockResolvedValue([clientRow()]);
    h.groupByStatusFiltered.mockResolvedValue([
      { status: "NEW_CANDIDATE", _count: { _all: 3 } },
      { status: "STARTED_DAY1", _count: { _all: 1 } },
    ]);
    h.listMeetings.mockResolvedValue([{ createdAt: new Date() }]);
    h.listTasks.mockResolvedValue([
      { status: "done", createdAt: new Date() },
      { status: "open", createdAt: new Date() },
    ]);
    // compare() reads exclusively from the batched *ForClients paths — same data, tagged with
    // clientId so gatherHealthInputsForClients can bucket it back out per client.
    h.groupByStatusForClients.mockResolvedValue([
      { status: "NEW_CANDIDATE", clientId: "c1", _count: { _all: 3 } },
      { status: "STARTED_DAY1", clientId: "c1", _count: { _all: 1 } },
    ]);
    h.listMeetingsForClients.mockResolvedValue([{ clientId: "c1", createdAt: new Date() }]);
    h.listTasksForClients.mockResolvedValue([
      { clientId: "c1", status: "done", createdAt: new Date() },
      { clientId: "c1", status: "open", createdAt: new Date() },
    ]);

    const [health, rows] = await Promise.all([
      crmAnalyticsService.healthScore("c1"),
      crmAnalyticsService.compare(),
    ]);
    const compareRow = rows.find((r) => r.clientId === "c1")!;

    expect(compareRow.healthScore).toBe(health.score);
    expect(compareRow.healthTier).toBe(health.tier);
  });

  it("compare() batches its reads into ONE query per data source, not one per client", async () => {
    h.listClients.mockResolvedValue([
      clientRow({ id: "c1" }),
      clientRow({ id: "c2", name: "Beta" }),
    ]);
    await crmAnalyticsService.compare();
    expect(h.groupByStatusForClients).toHaveBeenCalledTimes(1);
    expect(h.groupByStatusForClients).toHaveBeenCalledWith(["c1", "c2"]);
    expect(h.listNotesForClients).toHaveBeenCalledTimes(1);
    expect(h.listMeetingsForClients).toHaveBeenCalledTimes(1);
    expect(h.listDealsForClients).toHaveBeenCalledTimes(1);
    expect(h.listTasksForClients).toHaveBeenCalledTimes(1);
    // The old per-client path is never touched by compare() anymore.
    expect(h.groupByStatusFiltered).not.toHaveBeenCalled();
    expect(h.listNotes).not.toHaveBeenCalled();
  });
});
