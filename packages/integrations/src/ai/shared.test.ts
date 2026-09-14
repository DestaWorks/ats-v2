import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  class APICallError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      if (statusCode !== undefined) this.statusCode = statusCode;
    }
    static isInstance(e: unknown): e is APICallError {
      return e instanceof APICallError;
    }
  }
  return { enabled: true, disabled: false, gen: vi.fn(), getSettings: vi.fn(), APICallError };
});

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({
  get aiEnabled() {
    return h.enabled;
  },
}));
vi.mock("./provider", () => ({ generateStructured: h.gen }));
vi.mock("@destaworks/db/repositories/ai-settings.repository", () => ({
  aiSettingsRepository: { getCached: h.getSettings },
}));
vi.mock("ai", () => ({ APICallError: h.APICallError }));

import { generateAi, isAiAvailable } from "./shared";

const opts = {
  tenantId: "t1",
  schema: { parse: (v: unknown) => v } as never,
  system: "sys",
  prompt: "prompt",
};

beforeEach(() => {
  h.enabled = true;
  h.gen.mockReset();
  h.getSettings.mockReset();
  h.getSettings.mockResolvedValue({ disabled: false });
});

describe("generateAi", () => {
  it("503s when the provider key isn't configured — never checks admin settings or calls the provider", async () => {
    h.enabled = false;
    await expect(generateAi("Test op", opts)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(h.getSettings).not.toHaveBeenCalled();
    expect(h.gen).not.toHaveBeenCalled();
  });

  it("503s when an admin has disabled AI — never calls the provider", async () => {
    h.getSettings.mockResolvedValue({ disabled: true });
    await expect(generateAi("Test op", opts)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(h.gen).not.toHaveBeenCalled();
  });

  it("calls the provider and returns its result when enabled and not admin-disabled", async () => {
    h.gen.mockResolvedValue({ ok: true });
    const result = await generateAi("Test op", opts);
    expect(result).toEqual({ ok: true });
    expect(h.gen).toHaveBeenCalledWith(expect.objectContaining({ operation: "Test op" }));
  });

  it("maps a 429 to RATE_LIMITED", async () => {
    h.gen.mockRejectedValue(new h.APICallError("busy", 429));
    await expect(generateAi("Test op", opts)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("isAiAvailable", () => {
  it("is false when the provider key isn't configured, without checking admin settings", async () => {
    h.enabled = false;
    expect(await isAiAvailable("t1")).toBe(false);
    expect(h.getSettings).not.toHaveBeenCalled();
  });

  it("is false when an admin has disabled AI", async () => {
    h.getSettings.mockResolvedValue({ disabled: true });
    expect(await isAiAvailable("t1")).toBe(false);
  });

  it("is true when enabled and not admin-disabled", async () => {
    expect(await isAiAvailable("t1")).toBe(true);
  });
});
