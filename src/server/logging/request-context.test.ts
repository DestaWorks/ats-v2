import { describe, it, expect, vi } from "vitest";

/**
 * Proves that per-request correlation propagates implicitly (AsyncLocalStorage) rather than being
 * threaded through every call signature — including across an `await`, and without leaking
 * between concurrent requests.
 */

vi.mock("server-only", () => ({}));

import { runWithLogContext, getLogContext, setLogContext } from "./request-context";
import { currentLogContext } from "@/lib/logger";

describe("request log context", () => {
  it("is undefined outside a request", () => {
    expect(getLogContext()).toBeUndefined();
  });

  it("exposes the requestId to the logger facade from anywhere inside the request", async () => {
    await runWithLogContext({ requestId: "req-1" }, async () => {
      await Promise.resolve();
      expect(currentLogContext()).toEqual({ requestId: "req-1" });
    });
  });

  it("lets the auth guard attach userId after the fact", async () => {
    await runWithLogContext({ requestId: "req-2" }, async () => {
      setLogContext({ userId: "user-2" });
      await Promise.resolve();
      expect(getLogContext()).toEqual({ requestId: "req-2", userId: "user-2" });
    });
  });

  it("does not leak between concurrent requests", async () => {
    const seen: (string | undefined)[] = [];
    await Promise.all([
      runWithLogContext({ requestId: "a" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(getLogContext()?.requestId);
      }),
      runWithLogContext({ requestId: "b" }, async () => {
        seen.push(getLogContext()?.requestId);
      }),
    ]);
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("ignores a context patch made outside any request", () => {
    setLogContext({ userId: "nobody" });
    expect(getLogContext()).toBeUndefined();
  });
});
