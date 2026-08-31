import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `pipelineReportsService.pipelineFunnel` — Wave 5.2. Proves the core fix end-to-end: a candidate
 * CURRENTLY rejected but who genuinely reached Submitted to Client (order 4) before being
 * rejected still counts in the Submitted-and-beyond bucket, and correctly does NOT count toward
 * Started (order 8) — legacy's `STATUSES.indexOf(status) >= idx` bug would have miscounted this
 * candidate as reaching EVERY earlier stage including Placed, because the rejection status codes
 * sort numerically above Started.
 */

const h = vi.hoisted(() => ({
  loadCohort: vi.fn(),
  maxStageOrderAsOf: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./cohort", () => ({
  loadCohort: h.loadCohort,
  scoreFor: vi.fn(() => null),
}));
vi.mock("@destaworks/db/repositories/stage-history.repository", () => ({
  stageHistoryRepository: { maxStageOrderAsOf: h.maxStageOrderAsOf },
}));

import { pipelineReportsService } from "./pipeline-reports.service";

const rejectedButReachedSubmitted = {
  id: "rejected-1",
  status: "CLIENT_REJECTED",
  stageEnteredAt: new Date("2026-01-10"),
  createdAt: new Date("2026-01-01"),
  clientId: null,
  licenseStatus: "Active",
};
const stillAtNewCandidateNoMoves = {
  id: "new-1",
  status: "NEW_CANDIDATE",
  stageEnteredAt: new Date("2026-01-15"),
  createdAt: new Date("2026-01-15"),
  clientId: null,
  licenseStatus: "Not Verified",
};

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.loadCohort.mockResolvedValue({
    candidates: [rejectedButReachedSubmitted, stillAtNewCandidateNoMoves],
    clientNames: new Map(),
    userNames: new Map(),
    rulesByClient: new Map(),
    capped: false,
  });
  // The repository is responsible for excluding terminal (order >= 9) transitions — this map
  // represents its output: the rejected candidate's real max ACTIVE order was 4 (Submitted).
  h.maxStageOrderAsOf.mockResolvedValue(new Map([["rejected-1", 4]]));
});

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("pipelineReportsService.pipelineFunnel", () => {
  it("counts a later-rejected candidate toward every ACTIVE stage they actually reached", async () => {
    const dto = await pipelineReportsService.pipelineFunnel(ctx, {});
    const byStatus = new Map(dto.stages.map((s) => [s.status, s.reachedCount]));

    // Reached New Candidate, Qualified, Initial Screening, Desta Review, Submitted (orders 0-4).
    expect(byStatus.get("NEW_CANDIDATE")).toBe(2); // both candidates
    expect(byStatus.get("SUBMITTED_TO_CLIENT")).toBe(1); // only the rejected-but-progressed one
  });

  it("does NOT count the rejected candidate toward Started (Day 1) — the bug this fixes", async () => {
    const dto = await pipelineReportsService.pipelineFunnel(ctx, {});
    const started = dto.stages.find((s) => s.status === "STARTED_DAY1");
    expect(started?.reachedCount).toBe(0);
  });

  it("a brand-new candidate with zero history rows still counts toward New Candidate", async () => {
    h.maxStageOrderAsOf.mockResolvedValue(new Map()); // no history rows at all
    const dto = await pipelineReportsService.pipelineFunnel(ctx, {});
    const newCandidateStage = dto.stages.find((s) => s.status === "NEW_CANDIDATE");
    expect(newCandidateStage?.reachedCount).toBe(2);
  });
});

describe("truncation reaches the DTO", () => {
  it("pipelineFunnel carries capped through from the cohort", async () => {
    h.loadCohort.mockResolvedValue({
      candidates: [],
      clientNames: new Map(),
      userNames: new Map(),
      rulesByClient: new Map(),
      capped: true,
    });
    h.maxStageOrderAsOf.mockResolvedValue(new Map());
    await expect(pipelineReportsService.pipelineFunnel(ctx, {})).resolves.toMatchObject({
      capped: true,
    });
  });

  it("executiveSummary carries capped through from the cohort", async () => {
    h.loadCohort.mockResolvedValue({
      candidates: [],
      clientNames: new Map(),
      userNames: new Map(),
      rulesByClient: new Map(),
      capped: true,
    });
    h.maxStageOrderAsOf.mockResolvedValue(new Map());
    await expect(pipelineReportsService.executiveSummary(ctx, {})).resolves.toMatchObject({
      capped: true,
    });
  });
});
