import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

const h = vi.hoisted(() => ({
  generateObject: vi.fn(),
  record: vi.fn(),
  fallback: undefined as string | undefined,
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: (id: string) => ({ provider: "anthropic", id }),
}));
vi.mock("@ai-sdk/openai", () => ({ openai: (id: string) => ({ provider: "openai", id }) }));
vi.mock("@ai-sdk/google", () => ({ google: (id: string) => ({ provider: "google", id }) }));
vi.mock("./config", () => ({
  AI_MODEL: "anthropic/claude-opus-4-8",
  get AI_MODEL_FALLBACK() {
    return h.fallback;
  },
  parseModel: (model: string) => {
    const [provider, modelId] = model.split("/");
    if (!provider || !modelId) throw new Error(`Invalid model string "${model}"`);
    return { provider, modelId };
  },
}));
vi.mock("@destaworks/db/repositories/ai-usage-event.repository", () => ({
  aiUsageEventRepository: { record: h.record },
}));

import { generateStructured } from "./provider";

const schema = z.object({ name: z.string() });
const baseOpts = { operation: "Test op", schema, system: "sys", prompt: "prompt" };

beforeEach(() => {
  h.generateObject.mockReset();
  h.record.mockReset();
  h.fallback = undefined;
});

describe("generateStructured", () => {
  it("returns the object and records a success event on the first try", async () => {
    h.generateObject.mockResolvedValue({
      object: { name: "Jane" },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await generateStructured({ ...baseOpts, model: "anthropic/claude-opus-4-8" });

    expect(result).toEqual({ name: "Jane" });
    expect(h.generateObject).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "Test op",
        provider: "anthropic",
        model: "claude-opus-4-8",
        status: "success",
        inputTokens: 10,
        outputTokens: 20,
      }),
    );
  });

  it("records a failure event and rethrows when no fallback is configured", async () => {
    const err = Object.assign(new Error("boom"), { statusCode: 500 });
    h.generateObject.mockRejectedValue(err);

    await expect(
      generateStructured({ ...baseOpts, model: "anthropic/claude-opus-4-8" }),
    ).rejects.toBe(err);

    expect(h.generateObject).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-opus-4-8",
        status: "error",
        errorStatusCode: 500,
      }),
    );
  });

  it("retries once against the fallback model on failure, and returns its result", async () => {
    h.fallback = "openai/gpt-5";
    const primaryErr = new Error("primary down");
    h.generateObject.mockRejectedValueOnce(primaryErr).mockResolvedValueOnce({
      object: { name: "Fallback" },
      usage: { inputTokens: 5, outputTokens: 8 },
    });

    const result = await generateStructured({ ...baseOpts, model: "anthropic/claude-opus-4-8" });

    expect(result).toEqual({ name: "Fallback" });
    expect(h.generateObject).toHaveBeenCalledTimes(2);
    expect(h.generateObject.mock.calls[0]![0].model).toEqual({
      provider: "anthropic",
      id: "claude-opus-4-8",
    });
    expect(h.generateObject.mock.calls[1]![0].model).toEqual({ provider: "openai", id: "gpt-5" });

    expect(h.record).toHaveBeenCalledTimes(2);
    expect(h.record.mock.calls[0]![0]).toMatchObject({ provider: "anthropic", status: "error" });
    expect(h.record.mock.calls[1]![0]).toMatchObject({
      provider: "openai",
      model: "gpt-5",
      status: "success",
    });
  });

  it("throws the fallback's error when both the primary and the fallback fail", async () => {
    h.fallback = "openai/gpt-5";
    const primaryErr = new Error("primary down");
    const fallbackErr = new Error("fallback down too");
    h.generateObject.mockRejectedValueOnce(primaryErr).mockRejectedValueOnce(fallbackErr);

    await expect(
      generateStructured({ ...baseOpts, model: "anthropic/claude-opus-4-8" }),
    ).rejects.toBe(fallbackErr);

    expect(h.generateObject).toHaveBeenCalledTimes(2);
    expect(h.record).toHaveBeenCalledTimes(2);
    expect(h.record.mock.calls[1]![0]).toMatchObject({ provider: "openai", status: "error" });
  });

  it("does not retry when the fallback model is the same as the primary", async () => {
    h.fallback = "anthropic/claude-opus-4-8";
    const err = new Error("boom");
    h.generateObject.mockRejectedValue(err);

    await expect(
      generateStructured({ ...baseOpts, model: "anthropic/claude-opus-4-8" }),
    ).rejects.toBe(err);

    expect(h.generateObject).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it("throws the primary's error (not a parse error) when AI_MODEL_FALLBACK is malformed, and still logs the primary failure", async () => {
    h.fallback = "not-a-valid-model-string";
    const primaryErr = new Error("primary down");
    h.generateObject.mockRejectedValue(primaryErr);

    await expect(
      generateStructured({ ...baseOpts, model: "anthropic/claude-opus-4-8" }),
    ).rejects.toBe(primaryErr);

    expect(h.generateObject).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", status: "error" }),
    );
  });
});
