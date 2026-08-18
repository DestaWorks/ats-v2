import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/prisma", () => ({
  prisma: { aiUsageEvent: { create: h.create, findMany: h.findMany, groupBy: h.groupBy } },
}));

import { aiUsageEventRepository } from "./ai-usage-event.repository";

beforeEach(() => {
  h.create.mockReset();
  h.findMany.mockReset();
  h.groupBy.mockReset();
});

describe("aiUsageEventRepository.record", () => {
  it("writes the metadata row", async () => {
    h.create.mockResolvedValue({});
    await aiUsageEventRepository.record({
      operation: "Resume extraction",
      provider: "anthropic",
      model: "claude-opus-4-8",
      status: "success",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 1200,
    });
    expect(h.create).toHaveBeenCalledWith({
      data: {
        operation: "Resume extraction",
        provider: "anthropic",
        model: "claude-opus-4-8",
        status: "success",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 1200,
      },
    });
  });

  it("never throws when the write fails", async () => {
    h.create.mockRejectedValue(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      aiUsageEventRepository.record({
        operation: "JD parsing",
        provider: "anthropic",
        model: "claude-opus-4-8",
        status: "error",
        latencyMs: 30,
        errorName: "APICallError",
        errorStatusCode: 500,
      }),
    ).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});

describe("aiUsageEventRepository.listRecent", () => {
  it("orders by newest first", async () => {
    h.findMany.mockResolvedValue([]);
    await aiUsageEventRepository.listRecent(20);
    expect(h.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" }, take: 20 });
  });
});

describe("aiUsageEventRepository.summarySince", () => {
  it("maps groupBy rows into a per-status breakdown", async () => {
    const since = new Date("2026-08-18T00:00:00.000Z");
    h.groupBy.mockResolvedValue([
      {
        status: "success",
        _count: { _all: 3 },
        _sum: { inputTokens: 300, outputTokens: 150, latencyMs: 3000 },
      },
      {
        status: "error",
        _count: { _all: 1 },
        _sum: { inputTokens: null, outputTokens: null, latencyMs: 50 },
      },
    ]);

    const result = await aiUsageEventRepository.summarySince(since);

    expect(h.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, latencyMs: true },
    });
    expect(result).toEqual([
      { status: "success", count: 3, inputTokens: 300, outputTokens: 150, latencyMsSum: 3000 },
      { status: "error", count: 1, inputTokens: 0, outputTokens: 0, latencyMsSum: 50 },
    ]);
  });
});
