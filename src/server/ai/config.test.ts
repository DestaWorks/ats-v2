import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("aiEnabled", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is true when the configured provider's key is present", async () => {
    process.env.AI_MODEL = "anthropic/claude-opus-4-8";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    delete process.env.AI_DISABLED;
    const { aiEnabled } = await import("./config");
    expect(aiEnabled).toBe(true);
  });

  it("is false when AI_DISABLED is set, even with a key present", async () => {
    process.env.AI_MODEL = "anthropic/claude-opus-4-8";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.AI_DISABLED = "true";
    const { aiEnabled } = await import("./config");
    expect(aiEnabled).toBe(false);
  });

  it("is false when the key is absent", async () => {
    process.env.AI_MODEL = "anthropic/claude-opus-4-8";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_DISABLED;
    const { aiEnabled } = await import("./config");
    expect(aiEnabled).toBe(false);
  });
});

describe("AI_MODEL_FALLBACK", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is undefined when unset", async () => {
    delete process.env.AI_MODEL_FALLBACK;
    const { AI_MODEL_FALLBACK } = await import("./config");
    expect(AI_MODEL_FALLBACK).toBeUndefined();
  });

  it("carries the configured fallback model string", async () => {
    process.env.AI_MODEL_FALLBACK = "openai/gpt-5";
    const { AI_MODEL_FALLBACK } = await import("./config");
    expect(AI_MODEL_FALLBACK).toBe("openai/gpt-5");
  });
});
