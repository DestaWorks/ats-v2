import { describe, it, expect, vi } from "vitest";
import { defer, firstValueFrom, of } from "rxjs";

/**
 * Proves the correlation id is established once per request and reaches everything downstream
 * implicitly (SAAS-RESTRUCTURE-PLAN 4.2 / "Logging"): the same id is readable from the request
 * object AND from the logger's AsyncLocalStorage context, across an `await`, without leaking
 * between concurrent requests.
 */

// `server-only` throws outside an RSC build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

import { getLogContext } from "@destaworks/config/logger/request-context";
import { RequestIdInterceptor } from "./request-id.interceptor";
import { readRequestId } from "../http";
import { fakeCallHandler, fakeHttpContext, RecordingResponse } from "../testing/nest-host";

function run(request: object, handler: () => Promise<unknown> | unknown): Promise<unknown> {
  const context = fakeHttpContext(request, new RecordingResponse());
  const observable = new RequestIdInterceptor().intercept(
    context,
    fakeCallHandler(() => defer(async () => handler())),
  );
  return firstValueFrom(observable);
}

describe("RequestIdInterceptor", () => {
  it("stamps a requestId on the request", async () => {
    const request: object = {};
    await run(request, () => null);
    expect(readRequestId(request)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("exposes that SAME id through the log context, including after an await", async () => {
    const request: object = {};
    const seen = await run(request, async () => {
      await Promise.resolve();
      return getLogContext()?.requestId;
    });
    expect(seen).toBe(readRequestId(request));
    expect(typeof seen).toBe("string");
  });

  it("does not leak the context between concurrent requests", async () => {
    const a: object = {};
    const b: object = {};
    const [seenA, seenB] = await Promise.all([
      run(a, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getLogContext()?.requestId;
      }),
      run(b, async () => getLogContext()?.requestId),
    ]);
    expect(seenA).toBe(readRequestId(a));
    expect(seenB).toBe(readRequestId(b));
    expect(seenA).not.toBe(seenB);
  });

  it("leaves no context behind once the request is done", async () => {
    await run({}, () => of(null));
    expect(getLogContext()).toBeUndefined();
  });
});
