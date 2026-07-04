import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proves the in-memory rate limiter: allows calls under the limit, throws RATE_LIMITED once the
 * limit is exceeded within the window, and resets after the window elapses. Uses fake timers so
 * the sliding window is exercised deterministically.
 */

vi.mock("server-only", () => ({}));

import { AppError } from "./app-error";
import { checkRateLimit, __resetRateLimit } from "./rate-limit";

beforeEach(() => {
  __resetRateLimit();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows calls up to the limit", () => {
    expect(() => {
      for (let i = 0; i < 3; i++) checkRateLimit("k", { limit: 3, windowMs: 1000 });
    }).not.toThrow();
  });

  it("throws RATE_LIMITED (429) once the limit is exceeded in the window", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("k", { limit: 3, windowMs: 1000 });
    try {
      checkRateLimit("k", { limit: 3, windowMs: 1000 });
      throw new Error("expected checkRateLimit to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("RATE_LIMITED");
      expect((err as AppError).status).toBe(429);
    }
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("k", { limit: 3, windowMs: 1000 });
    expect(() => checkRateLimit("k", { limit: 3, windowMs: 1000 })).toThrow();
    // Advance past the window — the old timestamps fall out and calls are allowed again.
    vi.advanceTimersByTime(1001);
    expect(() => checkRateLimit("k", { limit: 3, windowMs: 1000 })).not.toThrow();
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", { limit: 3, windowMs: 1000 });
    expect(() => checkRateLimit("a", { limit: 3, windowMs: 1000 })).toThrow();
    // A different key has its own budget.
    expect(() => checkRateLimit("b", { limit: 3, windowMs: 1000 })).not.toThrow();
  });
});
