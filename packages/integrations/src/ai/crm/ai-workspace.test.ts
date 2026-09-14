import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `generateWorkspaceText` — Wave 4.2 flex, AI Client Workspace. Mirrors `parse-resume.test.ts`'s
 * mocked-provider pattern (never a real LLM call): the feature flag gates the call, a preset
 * builds the right task text, and provider errors map to the right `AppError` by HTTP status.
 */

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
  return { enabled: true, gen: vi.fn(), APICallError };
});

vi.mock("server-only", () => ({}));
vi.mock("../config", () => ({
  get aiEnabled() {
    return h.enabled;
  },
}));
vi.mock("../provider", () => ({ generateStructured: h.gen }));
vi.mock("ai", () => ({ APICallError: h.APICallError }));
vi.mock("@destaworks/db/repositories/ai-settings.repository", () => ({
  aiSettingsRepository: { getCached: async () => ({ disabled: false }) },
}));

import { generateWorkspaceText } from "./ai-workspace";

const ctx = {
  clientName: "Acme Health",
  priority: "HIGH",
  cadence: "Weekly",
  recentActivity: ["[Note] Called about the PMHNP req"],
};

beforeEach(() => {
  h.enabled = true;
  h.gen.mockReset();
});

describe("generateWorkspaceText", () => {
  it("503s when AI isn't configured — never calls the provider", async () => {
    h.enabled = false;
    await expect(
      generateWorkspaceText(ctx, { preset: "brief" }, { tenantId: "t1" }),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(h.gen).not.toHaveBeenCalled();
  });

  it("builds the prompt from context + the preset task, returns the model's text", async () => {
    h.gen.mockResolvedValue({ text: "Acme is engaged, one open req in progress." });
    const result = await generateWorkspaceText(ctx, { preset: "brief" }, { tenantId: "t1" });
    expect(result.text).toBe("Acme is engaged, one open req in progress.");
    const call = h.gen.mock.calls[0]![0];
    expect(call.prompt).toContain("Acme Health");
    expect(call.prompt).toContain("Called about the PMHNP req");
    expect(call.prompt).toContain("client brief"); // the brief preset's task text
  });

  it("uses the custom prompt verbatim when no preset is given", async () => {
    h.gen.mockResolvedValue({ text: "..." });
    await generateWorkspaceText(
      ctx,
      { customPrompt: "What's their renewal risk?" },
      { tenantId: "t1" },
    );
    const call = h.gen.mock.calls[0]![0];
    expect(call.prompt).toContain("What's their renewal risk?");
  });

  it("maps a 429 to RATE_LIMITED, and 401/403 to FEATURE_DISABLED", async () => {
    h.gen.mockRejectedValueOnce(new h.APICallError("busy", 429));
    await expect(
      generateWorkspaceText(ctx, { preset: "summary" }, { tenantId: "t1" }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    h.gen.mockRejectedValueOnce(new h.APICallError("unauthorized", 401));
    await expect(
      generateWorkspaceText(ctx, { preset: "summary" }, { tenantId: "t1" }),
    ).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
  });
});
