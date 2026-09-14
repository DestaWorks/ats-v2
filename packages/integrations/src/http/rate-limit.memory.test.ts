import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, __resetRateLimit } from "./rate-limit";
import { AppError } from "./app-error";

/**
 * The in-memory limiter is the real one whenever REDIS_URL is unset, which is the intended
 * single-instance deployment. It is a sliding window in a Map, and a Map keyed by something the
 * CLIENT controls — anonymous callers are keyed by the `x-forwarded-for` address — grows without
 * bound unless something evicts. A forged header per request would otherwise be a memory
 * exhaustion vector on an unauthenticated endpoint.
 */
afterEach(() => {
  __resetRateLimit();
  vi.useRealTimers();
});

describe("in-memory rate limit", () => {
  it("allows up to the limit and refuses the next one", async () => {
    const opts = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) await checkRateLimit("k", opts);
    await expect(checkRateLimit("k", opts)).rejects.toBeInstanceOf(AppError);
  });

  it("keeps separate counters per key, so one caller cannot exhaust another's", async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    await checkRateLimit("ip:1.1.1.1", opts);
    await expect(checkRateLimit("ip:2.2.2.2", opts)).resolves.toBeUndefined();
  });

  it("lets a caller through again once its window has passed", async () => {
    vi.useFakeTimers();
    const opts = { limit: 1, windowMs: 1_000 };
    await checkRateLimit("k", opts);
    await expect(checkRateLimit("k", opts)).rejects.toBeInstanceOf(AppError);
    vi.advanceTimersByTime(1_500);
    await expect(checkRateLimit("k", opts)).resolves.toBeUndefined();
  });

  it("does not grow without bound when every request forges a new key", async () => {
    vi.useFakeTimers();
    const opts = { limit: 5, windowMs: 1_000 };

    // 25k distinct keys — what a spoofed `x-forwarded-for` per request produces.
    for (let i = 0; i < 25_000; i++) await checkRateLimit(`ip:10.0.${i >> 8}.${i & 255}`, opts);

    // Past every window, so a further request must find the old keys evicted rather than kept.
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    await checkRateLimit("ip:trigger", opts);

    const { trackedKeyCount } = await import("./rate-limit");
    expect(trackedKeyCount()).toBeLessThan(25_000);
  });
});
