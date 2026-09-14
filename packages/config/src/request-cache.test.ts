import { describe, it, expect, vi } from "vitest";
import { requestMemo, runWithRequestCache } from "./request-cache";

describe("requestMemo", () => {
  it("loads once per scope, however many callers ask", async () => {
    const load = vi.fn(async (t: string) => `rows:${t}`);
    const memo = requestMemo("x", load);

    const [a, b, c] = await runWithRequestCache(() =>
      Promise.all([memo("t1"), memo("t1"), memo("t1")]),
    );

    expect(load).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(["rows:t1", "rows:t1", "rows:t1"]);
  });

  it("shares the in-flight promise rather than racing a second query", async () => {
    let started = 0;
    const memo = requestMemo("x", async (t: string) => {
      started++;
      await new Promise((r) => setTimeout(r, 5));
      return t;
    });

    await runWithRequestCache(() => Promise.all([memo("t1"), memo("t1")]));
    expect(started).toBe(1);
  });

  it("keys by argument, so two tenants are two loads", async () => {
    const load = vi.fn(async (t: string) => t);
    const memo = requestMemo("x", load);

    await runWithRequestCache(() => Promise.all([memo("t1"), memo("t2")]));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does NOT leak across scopes — one request must never serve another's rows", async () => {
    const load = vi.fn(async (t: string) => t);
    const memo = requestMemo("x", load);

    await runWithRequestCache(() => memo("t1"));
    await runWithRequestCache(() => memo("t1"));

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("calls straight through outside a scope, rather than throwing", async () => {
    const load = vi.fn(async (t: string) => t);
    const memo = requestMemo("x", load);

    await expect(memo("t1")).resolves.toBe("t1");
    await expect(memo("t1")).resolves.toBe("t1");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("separate memos with the same argument do not collide", async () => {
    const clients = requestMemo("clients", async (t: string) => `clients:${t}`);
    const users = requestMemo("users", async (t: string) => `users:${t}`);

    const [a, b] = await runWithRequestCache(() => Promise.all([clients("t1"), users("t1")]));
    expect(a).toBe("clients:t1");
    expect(b).toBe("users:t1");
  });
});
