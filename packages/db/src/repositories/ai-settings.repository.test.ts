import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../prisma", () => ({
  db: () => ({ aiSettings: { findUnique: h.findUnique, upsert: h.upsert } }),
}));

import { aiSettingsRepository } from "./ai-settings.repository";

beforeEach(() => {
  h.findUnique.mockReset();
  h.upsert.mockReset();
});

describe("aiSettingsRepository.get", () => {
  it("defaults to not-disabled when no row exists", async () => {
    h.findUnique.mockResolvedValue(null);
    expect(await aiSettingsRepository.get()).toEqual({ disabled: false, disabledReason: null });
  });

  it("reflects the stored value", async () => {
    h.findUnique.mockResolvedValue({ disabled: true, disabledReason: "incident" });
    expect(await aiSettingsRepository.get()).toEqual({
      disabled: true,
      disabledReason: "incident",
    });
  });

  it("fails open (not disabled) when the read throws", async () => {
    h.findUnique.mockRejectedValue(new Error("connection refused"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await aiSettingsRepository.get()).toEqual({ disabled: false, disabledReason: null });
    errorSpy.mockRestore();
  });
});

describe("aiSettingsRepository.setDisabled", () => {
  it("upserts the singleton row", async () => {
    h.upsert.mockResolvedValue({});
    await aiSettingsRepository.setDisabled(true, "u1", "incident");
    expect(h.upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", disabled: true, disabledReason: "incident", updatedBy: "u1" },
      update: { disabled: true, disabledReason: "incident", updatedBy: "u1" },
    });
  });
});

describe("aiSettingsRepository.getCached", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reuses the first read within the TTL window instead of hitting the DB again", async () => {
    h.findUnique.mockResolvedValue({ disabled: false, disabledReason: null });
    const { aiSettingsRepository: fresh } = await import("./ai-settings.repository");

    await fresh.getCached();
    await fresh.getCached();

    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });

  it("setDisabled updates the cache directly, so the next getCached reflects it without a DB read", async () => {
    h.findUnique.mockResolvedValue({ disabled: false, disabledReason: null });
    h.upsert.mockResolvedValue({});
    const { aiSettingsRepository: fresh } = await import("./ai-settings.repository");

    expect(await fresh.getCached()).toEqual({ disabled: false, disabledReason: null });
    await fresh.setDisabled(true, "u1", "incident");
    expect(await fresh.getCached()).toEqual({ disabled: true, disabledReason: "incident" });

    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });
});
