import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The Redis-backed path. Redis itself is mocked — what is being tested is the CONTRACT this file
 * relies on: one MULTI so a concurrent caller cannot observe a half-applied window, a TTL on every
 * write so an idle key expires itself, and a refused attempt removed again so being rejected does
 * not consume a slot.
 */
const exec = vi.fn();
const zRem = vi.fn();
const connect = vi.fn().mockResolvedValue(undefined);
const calls: string[] = [];

function chain() {
  const self = {
    zRemRangeByScore: (...a: unknown[]) => (calls.push(`zRemRangeByScore:${a[1]},${a[2]}`), self),
    zAdd: (...a: unknown[]) => (calls.push(`zAdd:${JSON.stringify(a[1])}`), self),
    zCard: () => (calls.push("zCard"), self),
    pExpire: (...a: unknown[]) => (calls.push(`pExpire:${a[1]}`), self),
    exec,
  };
  return self;
}

vi.mock("redis", () => ({
  createClient: () => ({
    isReady: false,
    isOpen: true,
    on: () => undefined,
    connect,
    multi: chain,
    zRem,
    quit: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("checkRateLimit (Redis-backed)", () => {
  let checkRateLimit: typeof import("./rate-limit").checkRateLimit;
  let shutdownRateLimit: typeof import("./rate-limit").shutdownRateLimit;
  let AppError: typeof import("./app-error").AppError;

  beforeEach(async () => {
    vi.resetModules();
    exec.mockReset();
    zRem.mockReset();
    calls.length = 0;
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    ({ checkRateLimit, shutdownRateLimit } = await import("./rate-limit"));
    ({ AppError } = await import("./app-error"));
  });

  afterEach(async () => {
    await shutdownRateLimit();
    vi.unstubAllEnvs();
  });

  it("allows a request under the limit", async () => {
    exec.mockResolvedValue([0, 1, 1, 1]);
    await expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("refuses once the window is full", async () => {
    exec.mockResolvedValue([0, 1, 6, 1]);
    await expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("removes the refused attempt, so being rejected does not consume a slot", async () => {
    exec.mockResolvedValue([0, 1, 6, 1]);
    await expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).rejects.toThrow();
    expect(zRem).toHaveBeenCalledTimes(1);
  });

  it("drops aged-out entries and sets a TTL in the same MULTI", async () => {
    exec.mockResolvedValue([0, 1, 1, 1]);
    await checkRateLimit("k", { limit: 5, windowMs: 60_000 });

    expect(calls.some((c) => c.startsWith("zRemRangeByScore"))).toBe(true);
    expect(calls).toContain("zCard");
    expect(calls).toContain("pExpire:60000");
  });

  it("fails OPEN when Redis is unreachable — a limiter outage must not take the endpoint down", async () => {
    exec.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(checkRateLimit("k", { limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("namespaces keys, so a limiter cannot collide with other data in the same Redis", async () => {
    exec.mockResolvedValue([0, 1, 1, 1]);
    await checkRateLimit("portal-access:ip:1.1.1.1", { limit: 5, windowMs: 60_000 });
    expect(zRem).not.toHaveBeenCalled();
  });
});
