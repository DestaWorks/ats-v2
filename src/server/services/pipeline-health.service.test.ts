import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves `pipelineHealthService.generate` assembles the AI context correctly (team-wide counts +
 * top-overdue candidates with resolved client names + computed days-in-stage) and forwards it to
 * `generatePipelineHealth`. No DB, no real AI call — everything is mocked.
 */

const h = vi.hoisted(() => ({
  candidateRepo: { count: vi.fn(), topOverdue: vi.fn() },
  clientRepo: { nameMap: vi.fn() },
  generatePipelineHealth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
}));
vi.mock("@/server/ai/pipeline-health/pipeline-health", () => ({
  generatePipelineHealth: h.generatePipelineHealth,
}));

import { pipelineHealthService } from "./pipeline-health.service";

beforeEach(() => {
  h.candidateRepo.count.mockReset();
  h.candidateRepo.topOverdue.mockReset().mockResolvedValue([]);
  h.clientRepo.nameMap.mockReset().mockResolvedValue(new Map());
  h.generatePipelineHealth.mockReset().mockResolvedValue({
    diagnostic: "d",
    healthScore: 80,
    topAction: "a",
  });
});

describe("pipelineHealthService.generate", () => {
  it("assembles team-wide totalActive/overdue/stuck counts and calls the AI module", async () => {
    h.candidateRepo.count
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);

    await pipelineHealthService.generate();

    const ctx = h.generatePipelineHealth.mock.calls[0]![0];
    expect(ctx.totalActive).toBe(42);
    expect(ctx.overdueCount).toBe(5);
    expect(ctx.stuckCount).toBe(2);
  });

  it("resolves client names and computes daysInStage for each overdue candidate", async () => {
    h.candidateRepo.count.mockResolvedValue(0);
    h.candidateRepo.topOverdue.mockResolvedValue([
      {
        id: "c1",
        name: "Jane Doe",
        status: "SUBMITTED_TO_CLIENT",
        clientId: "cl1",
        stageEnteredAt: new Date("2026-06-21T00:00:00.000Z"), // 10 days before a mocked "now" isn't
      },
      {
        id: "c2",
        name: "No Client",
        status: "NEW_CANDIDATE",
        clientId: null,
        stageEnteredAt: new Date(),
      },
    ]);
    h.clientRepo.nameMap.mockResolvedValue(new Map([["cl1", "Acme Health"]]));

    await pipelineHealthService.generate();

    const ctx = h.generatePipelineHealth.mock.calls[0]![0];
    expect(ctx.topOverdue).toHaveLength(2);
    expect(ctx.topOverdue[0]).toMatchObject({ name: "Jane Doe", clientName: "Acme Health" });
    expect(ctx.topOverdue[0].daysInStage).toBeGreaterThan(0);
    expect(ctx.topOverdue[1]).toMatchObject({ name: "No Client", clientName: null });
  });

  it("returns whatever the AI module returns", async () => {
    h.candidateRepo.count.mockResolvedValue(0);
    const result = await pipelineHealthService.generate();
    expect(result).toEqual({ diagnostic: "d", healthScore: 80, topAction: "a" });
  });
});
