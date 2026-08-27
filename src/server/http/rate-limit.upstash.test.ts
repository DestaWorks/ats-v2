import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const limitMock = vi.fn();

vi.mock("@upstash/redis", () => ({
  Redis: class {},
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(tokens: number, window: string) {
      return { tokens, window };
    }
    limit = limitMock;
  }
  return { Ratelimit };
});

describe("checkRateLimit (Upstash-backed)", () => {
  let checkRateLimit: typeof import("./rate-limit").checkRateLimit;
  let AppError: typeof import("./app-error").AppError;

  beforeEach(async () => {
    vi.resetModules();
    limitMock.mockReset();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    ({ checkRateLimit } = await import("./rate-limit"));
    ({ AppError } = await import("./app-error"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the request when Upstash reports success", async () => {
    limitMock.mockResolvedValue({ success: true });
    await expect(checkRateLimit("k", { limit: 20, windowMs: 60_000 })).resolves.not.toThrow();
  });

  it("throws RATE_LIMITED when Upstash reports the limit exceeded", async () => {
    limitMock.mockResolvedValue({ success: false });
    try {
      await checkRateLimit("k", { limit: 20, windowMs: 60_000 });
      throw new Error("expected checkRateLimit to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as InstanceType<typeof AppError>).code).toBe("RATE_LIMITED");
    }
  });

  it("fails open when the Upstash call itself errors", async () => {
    limitMock.mockRejectedValue(new Error("network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(checkRateLimit("k", { limit: 20, windowMs: 60_000 })).resolves.not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    const line = JSON.parse(String(warnSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line.level).toBe("warn");
    expect(line.msg).toBe("rate_limit.upstash.unavailable");
    expect(line.outcome).toBe("fail-open");
    warnSpy.mockRestore();
  });
});
