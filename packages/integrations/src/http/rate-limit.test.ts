import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  it("allows calls up to the limit", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("k", { limit: 3, windowMs: 1000 });
  });

  it("throws RATE_LIMITED (429) once the limit is exceeded in the window", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("k", { limit: 3, windowMs: 1000 });
    try {
      await checkRateLimit("k", { limit: 3, windowMs: 1000 });
      throw new Error("expected checkRateLimit to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("RATE_LIMITED");
      expect((err as AppError).status).toBe(429);
    }
  });

  it("resets after the window elapses", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("k", { limit: 3, windowMs: 1000 });
    await expect(checkRateLimit("k", { limit: 3, windowMs: 1000 })).rejects.toThrow();
    vi.advanceTimersByTime(1001);
    await expect(checkRateLimit("k", { limit: 3, windowMs: 1000 })).resolves.not.toThrow();
  });

  it("tracks keys independently", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("a", { limit: 3, windowMs: 1000 });
    await expect(checkRateLimit("a", { limit: 3, windowMs: 1000 })).rejects.toThrow();
    await expect(checkRateLimit("b", { limit: 3, windowMs: 1000 })).resolves.not.toThrow();
  });
});
