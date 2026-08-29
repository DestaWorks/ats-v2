import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), create: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../prisma", () => {
  const prisma: Record<string, unknown> = {
    aiSettings: { findFirst: h.findFirst, update: h.update, create: h.create },
  };
  // The seam builds its client with `prisma.$extends(...)`. Returning the fake unchanged keeps
  // these assertions about the query the REPOSITORY composes; that the extension then adds the
  // tenant filter is proven against real Prisma in `tenant-scope.test.ts`.
  prisma["$extends"] = () => prisma;
  return { prisma, db: (tx?: unknown) => tx ?? prisma };
});

import { aiSettingsRepository } from "./ai-settings.repository";

const ctx = { tenantId: "t1" } as never;

beforeEach(() => {
  h.findFirst.mockReset();
  h.update.mockReset();
  h.create.mockReset();
});

describe("aiSettingsRepository.get", () => {
  it("defaults to not-disabled when no row exists", async () => {
    h.findFirst.mockResolvedValue(null);
    expect(await aiSettingsRepository.get(ctx)).toEqual({ disabled: false, disabledReason: null });
  });

  it("reflects the stored value", async () => {
    h.findFirst.mockResolvedValue({ disabled: true, disabledReason: "incident" });
    expect(await aiSettingsRepository.get(ctx)).toEqual({
      disabled: true,
      disabledReason: "incident",
    });
  });

  it("fails open (not disabled) when the read throws", async () => {
    h.findFirst.mockRejectedValue(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await aiSettingsRepository.get(ctx)).toEqual({ disabled: false, disabledReason: null });
    errorSpy.mockRestore();
  });
});

describe("aiSettingsRepository.setDisabled", () => {
  it("creates the tenant's row when it has none yet", async () => {
    h.findFirst.mockResolvedValue(null);
    h.create.mockResolvedValue({});
    await aiSettingsRepository.setDisabled(ctx, true, "u1", "incident");
    expect(h.create).toHaveBeenCalledWith({
      data: { id: "t1", disabled: true, disabledReason: "incident", updatedBy: "u1" },
    });
  });

  it("updates the existing row rather than creating a second one", async () => {
    h.findFirst.mockResolvedValue({ id: "t1" });
    h.update.mockResolvedValue({});
    await aiSettingsRepository.setDisabled(ctx, false, "u2", null);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { disabled: false, disabledReason: null, updatedBy: "u2" },
    });
  });
});

describe("aiSettingsRepository.getCached", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reuses the first read within the TTL window instead of hitting the DB again", async () => {
    h.findFirst.mockResolvedValue({ disabled: false, disabledReason: null });
    const { aiSettingsRepository: fresh } = await import("./ai-settings.repository");

    await fresh.getCached(ctx);
    await fresh.getCached(ctx);

    expect(h.findFirst).toHaveBeenCalledTimes(1);
  });

  it("setDisabled updates the cache directly, so the next getCached reflects it without a DB read", async () => {
    h.findFirst.mockResolvedValue({ disabled: false, disabledReason: null });
    h.create.mockResolvedValue({});
    const { aiSettingsRepository: fresh } = await import("./ai-settings.repository");

    expect(await fresh.getCached(ctx)).toEqual({ disabled: false, disabledReason: null });
    await fresh.setDisabled(ctx, true, "u1", "incident");
    expect(await fresh.getCached(ctx)).toEqual({ disabled: true, disabledReason: "incident" });

    // One read for the first getCached, one for setDisabled's own row lookup — the second
    // getCached is served from the cache setDisabled primed.
    expect(h.findFirst).toHaveBeenCalledTimes(2);
  });
});
