import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  setDisabled: vi.fn(),
  summarySince: vi.fn(),
  listRecent: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/ai-settings.repository", () => ({
  aiSettingsRepository: { get: h.get, setDisabled: h.setDisabled },
}));
vi.mock("@/server/repositories/ai-usage-event.repository", () => ({
  aiUsageEventRepository: { summarySince: h.summarySince, listRecent: h.listRecent },
}));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn({}),
}));

import { aiOpsService } from "./ai-ops.service";

const actor = { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" as const };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
});

describe("aiOpsService.getSettings", () => {
  it("passes through the repository read", async () => {
    h.get.mockResolvedValue({ disabled: true });
    expect(await aiOpsService.getSettings()).toEqual({ disabled: true });
  });
});

describe("aiOpsService.setDisabled", () => {
  it("upserts the flag + reason and writes an audit entry inside one transaction", async () => {
    await aiOpsService.setDisabled(true, actor, "incident");
    expect(h.setDisabled).toHaveBeenCalledWith(true, "u1", "incident", {});
    expect(h.writeAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        entity: "ai_settings",
        entityId: "singleton",
        actor: "u1",
        action: "disable",
        after: { disabledReason: "incident" },
      }),
    );
  });

  it("nulls the reason out when re-enabling, even if one was passed", async () => {
    await aiOpsService.setDisabled(false, actor, "ignored");
    expect(h.setDisabled).toHaveBeenCalledWith(false, "u1", null, {});
  });

  it("normalizes a blank/whitespace-only reason to null instead of storing an empty string", async () => {
    await aiOpsService.setDisabled(true, actor, "   ");
    expect(h.setDisabled).toHaveBeenCalledWith(true, "u1", null, {});
  });

  it("trims a reason with surrounding whitespace", async () => {
    await aiOpsService.setDisabled(true, actor, "  incident  ");
    expect(h.setDisabled).toHaveBeenCalledWith(true, "u1", "incident", {});
  });

  it("logs 'enable' when re-enabling", async () => {
    await aiOpsService.setDisabled(false, actor);
    expect(h.writeAudit).toHaveBeenCalledWith({}, expect.objectContaining({ action: "enable" }));
  });
});

describe("aiOpsService.getUsageOverview", () => {
  it("aggregates the status breakdown into totals and maps recent rows to DTOs", async () => {
    h.summarySince.mockResolvedValue([
      { status: "success", count: 3, inputTokens: 300, outputTokens: 150, latencyMsSum: 3000 },
      { status: "error", count: 1, inputTokens: 0, outputTokens: 0, latencyMsSum: 40 },
    ]);
    h.listRecent.mockResolvedValue([
      {
        id: "e1",
        operation: "JD parsing",
        provider: "google",
        model: "gemini-flash-latest",
        status: "success",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 900,
        errorName: null,
        errorStatusCode: null,
        createdAt: new Date("2026-08-18T00:00:00.000Z"),
      },
    ]);

    const result = await aiOpsService.getUsageOverview();

    expect(result.totalCalls).toBe(4);
    expect(result.successCount).toBe(3);
    expect(result.errorCount).toBe(1);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalOutputTokens).toBe(150);
    expect(result.avgLatencyMs).toBe(Math.round((3000 + 40) / 4));
    expect(result.recent).toEqual([
      {
        id: "e1",
        operation: "JD parsing",
        provider: "google",
        model: "gemini-flash-latest",
        status: "success",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 900,
        errorName: null,
        errorStatusCode: null,
        createdAt: "2026-08-18T00:00:00.000Z",
      },
    ]);
  });

  it("zeroes out cleanly when there's no usage yet", async () => {
    h.summarySince.mockResolvedValue([]);
    h.listRecent.mockResolvedValue([]);
    const result = await aiOpsService.getUsageOverview();
    expect(result).toMatchObject({
      totalCalls: 0,
      successCount: 0,
      errorCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: 0,
      recent: [],
    });
  });
});
