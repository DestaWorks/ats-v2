import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";

/**
 * The deadline is tested through the REAL Vercel AI SDK, with only the provider factory swapped
 * for a mock model. That is the point of the test: a mocked `generateObject` would prove nothing
 * about whether the signal reaches the SDK, and "reaches the SDK" is the whole requirement —
 * a deadline merely observed after the call returns leaves the slot held for the full retry run.
 *
 * The mock models are provider-shaped, not vendor-shaped: the same signal path is what Claude,
 * OpenAI and Gemini all get, because `generateObject` is the only place any of them is called.
 */
const h = vi.hoisted(() => ({
  fallback: undefined as string | undefined,
  primaryCalls: 0,
}));

/** Never settles on its own — only an abort can end it. The "slow provider" of the requirement. */
const hangingModel = new MockLanguageModelV3({
  doGenerate: ({ abortSignal }) => {
    h.primaryCalls += 1;
    return new Promise((_resolve, reject) => {
      abortSignal?.addEventListener("abort", () => {
        reject(abortSignal.reason);
      });
    });
  },
});

/** Fails in a way the SDK considers retryable, so it exercises the retry loop and its backoff. */
const alwaysRetryableModel = new MockLanguageModelV3({
  doGenerate: () => {
    h.primaryCalls += 1;
    return Promise.reject(
      new APICallError({
        message: "upstream unavailable",
        url: "https://provider.test",
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      }),
    );
  },
});

let primaryModel: MockLanguageModelV3 = hangingModel;

vi.mock("server-only", () => ({}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => primaryModel }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => primaryModel }));
vi.mock("@ai-sdk/google", () => ({ google: () => primaryModel }));
vi.mock("./config", () => ({
  aiEnabled: true,
  AI_MODEL: "anthropic/test-model",
  get AI_MODEL_FALLBACK() {
    return h.fallback;
  },
  parseModel: (model: string) => {
    const [provider, modelId] = model.split("/");
    return { provider, modelId };
  },
}));
vi.mock("@destaworks/db/repositories/ai-usage-event.repository", () => ({
  aiUsageEventRepository: { record: vi.fn() },
}));
vi.mock("@destaworks/db/repositories/ai-settings.repository", () => ({
  aiSettingsRepository: { getCached: () => Promise.resolve({ disabled: false }) },
}));

import { AI_BUDGET_MS, isAbortError, startAiDeadline } from "./deadline";
import { generateAi } from "./shared";

const opts = {
  tenantId: "t1",
  schema: z.object({ name: z.string() }),
  system: "sys",
  prompt: "prompt",
};

/**
 * The SDK's first retry backoff is 2000ms (measured: attempts land at +0ms, +2000ms, +6000ms).
 * Asserting the operation finished well inside that is what distinguishes a real deadline from a
 * per-attempt timeout — the latter cannot end the run before the first backoff has been slept.
 */
const FIRST_BACKOFF_MS = 2_000;

beforeEach(() => {
  h.fallback = undefined;
  h.primaryCalls = 0;
  primaryModel = hangingModel;
});

describe("the AI deadline", () => {
  it("aborts a slow provider at the budget, in about the budget's time", async () => {
    const startedAt = Date.now();

    await expect(generateAi("Test op", { ...opts, budgetMs: 300 })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      status: 504,
      message: "Test op did not finish within 300ms",
    });

    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(280);
    expect(elapsed).toBeLessThan(FIRST_BACKOFF_MS);
    expect(h.primaryCalls).toBe(1);
  });

  it("bounds the WHOLE operation, retries included — not each attempt", async () => {
    primaryModel = alwaysRetryableModel;
    const startedAt = Date.now();

    await expect(generateAi("Test op", { ...opts, budgetMs: 400 })).rejects.toMatchObject({
      status: 504,
    });

    // Left to itself this run is 3 attempts and 6s of backoff. The budget cut it inside 400ms,
    // mid-backoff, which a per-attempt timeout could not do at any setting.
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeLessThan(FIRST_BACKOFF_MS);
    expect(h.primaryCalls).toBe(1);
  });

  it("lets the caller's own signal end the operation early, and says so", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const startedAt = Date.now();

    await expect(
      generateAi("Test op", { ...opts, signal: controller.signal, budgetMs: 60_000 }),
    ).rejects.toMatchObject({ status: 504, message: "Test op was cancelled" });

    expect(Date.now() - startedAt).toBeLessThan(FIRST_BACKOFF_MS);
  });
});

describe("startAiDeadline", () => {
  it("defaults to AI_BUDGET_MS and starts un-aborted", () => {
    const deadline = startAiDeadline();
    expect(deadline.budgetMs).toBe(AI_BUDGET_MS);
    expect(deadline.signal.aborted).toBe(false);
    expect(deadline.expired()).toBe(false);
  });

  it("has a default ceiling above a slow call and below the slots that hold one", () => {
    expect(AI_BUDGET_MS).toBe(120_000);
  });

  it("reports an already-cancelled caller as cancelled, not as an expired budget", () => {
    const deadline = startAiDeadline({
      tenantId: "t1",
      signal: AbortSignal.abort(),
      budgetMs: 60_000,
    });
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.expired()).toBe(false);
  });
});

describe("isAbortError", () => {
  it("recognises an abort nested one level inside a provider's own error", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isAbortError(new Error("call failed", { cause: abort }))).toBe(true);
  });

  it("does not mistake an ordinary provider failure for an abort", () => {
    expect(isAbortError(new Error("upstream unavailable"))).toBe(false);
    expect(isAbortError("not an error")).toBe(false);
  });
});
