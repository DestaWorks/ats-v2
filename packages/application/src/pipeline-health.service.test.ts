import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";

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
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@destaworks/db/repositories/client.repository", () => ({
  clientRepository: h.clientRepo,
}));
vi.mock("@destaworks/integrations/ai/pipeline-health/pipeline-health", () => ({
  generatePipelineHealth: h.generatePipelineHealth,
}));

import { pipelineHealthService, __resetPipelineHealthCache } from "./pipeline-health.service";

const actor: TenantContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  modules: MODULES,
  capabilities: ROLE_CAPABILITIES.Associate,
  user: { id: "u1", email: "u@desta.works", name: "Test User" },
  role: "Associate",
};

beforeEach(() => {
  // The strip is cached per workspace in module state, so without this the first case's result is
  // served to every later one — which reads as "the AI module was never called", not as a cache.
  __resetPipelineHealthCache();
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

    await pipelineHealthService.generate(actor);

    const ctx = h.generatePipelineHealth.mock.calls[0]![0];
    expect(ctx.totalActive).toBe(42);
    expect(ctx.overdueCount).toBe(5);
    expect(ctx.stuckCount).toBe(2);
    for (const call of h.candidateRepo.count.mock.calls) expect(call[0]).toBe(actor);
    expect(h.candidateRepo.topOverdue).toHaveBeenCalledWith(
      actor,
      expect.anything(),
      expect.any(Date),
    );
    expect(h.clientRepo.nameMap).toHaveBeenCalledWith(actor);
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

    await pipelineHealthService.generate(actor);

    const ctx = h.generatePipelineHealth.mock.calls[0]![0];
    expect(ctx.topOverdue).toHaveLength(2);
    expect(ctx.topOverdue[0]).toMatchObject({ name: "Jane Doe", clientName: "Acme Health" });
    expect(ctx.topOverdue[0].daysInStage).toBeGreaterThan(0);
    expect(ctx.topOverdue[1]).toMatchObject({ name: "No Client", clientName: null });
  });

  it("returns whatever the AI module returns", async () => {
    h.candidateRepo.count.mockResolvedValue(0);
    const result = await pipelineHealthService.generate(actor);
    expect(result).toEqual({ diagnostic: "d", healthScore: 80, topAction: "a" });
  });
});

describe("pipelineHealthService.generate — caching", () => {
  it("generates once per workspace, then serves the cached strip", async () => {
    h.candidateRepo.count.mockResolvedValue(0);

    const first = await pipelineHealthService.generate(actor);
    const second = await pipelineHealthService.generate(actor);

    expect(second).toEqual(first);
    expect(h.generatePipelineHealth).toHaveBeenCalledTimes(1);
  });

  it("regenerates when the caller forces it — the Refresh button must actually refresh", async () => {
    h.candidateRepo.count.mockResolvedValue(0);

    await pipelineHealthService.generate(actor);
    await pipelineHealthService.generate(actor, { force: true });

    expect(h.generatePipelineHealth).toHaveBeenCalledTimes(2);
  });

  it("caches per WORKSPACE, so one tenant never reads another's strip", async () => {
    h.candidateRepo.count.mockResolvedValue(0);

    await pipelineHealthService.generate(actor);
    await pipelineHealthService.generate({ ...actor, tenantId: "t2" });

    expect(h.generatePipelineHealth).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent callers into ONE generation, not one each", async () => {
    h.candidateRepo.count.mockResolvedValue(0);

    const [a, b, c] = await Promise.all([
      pipelineHealthService.generate(actor),
      pipelineHealthService.generate(actor),
      pipelineHealthService.generate(actor),
    ]);

    expect(h.generatePipelineHealth).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("does not wedge the workspace when a generation fails", async () => {
    h.candidateRepo.count.mockResolvedValue(0);
    h.generatePipelineHealth.mockRejectedValueOnce(new Error("model unavailable"));

    await expect(pipelineHealthService.generate(actor)).rejects.toThrow("model unavailable");

    // The failed promise must not still be sitting in the in-flight map.
    await expect(pipelineHealthService.generate(actor)).resolves.toBeDefined();
  });
});
