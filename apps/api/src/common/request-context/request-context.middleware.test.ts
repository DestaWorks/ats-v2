import { describe, it, expect, vi } from "vitest";
import { requestMemo } from "@destaworks/config/request-cache";
import { requestContextMiddleware } from "./request-context.middleware";
import { installNestRequestContext, type HttpRequestLike } from "./nest-request-context";

/**
 * The middleware, not the primitives it composes.
 *
 * `requestMemo` calls straight through when no scope is open — deliberately, so a script or a test
 * still reads correct data. That also means a middleware that forgets to open one degrades
 * silently to no caching at all, which is precisely how the React `cache()` it replaced managed to
 * do nothing for months without a single failing test. These assert the wiring itself.
 */
// Installed at boot by `main.ts`; the middleware only fills the store the adapter reads from.
installNestRequestContext();

const request = (): HttpRequestLike => ({ headers: { cookie: "session=abc" } });

describe("requestContextMiddleware", () => {
  it("opens a cache scope, so a memo inside the request loads once", () => {
    const load = vi.fn(async (t: string) => `rows:${t}`);
    const memo = requestMemo("wiring", load);

    requestContextMiddleware(request(), undefined, () => {
      void memo("t1");
      void memo("t1");
      void memo("t1");
    });

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("gives each request its own scope — one caller never reads another's rows", () => {
    const load = vi.fn(async (t: string) => `rows:${t}`);
    const memo = requestMemo("wiring", load);

    requestContextMiddleware(request(), undefined, () => void memo("t1"));
    requestContextMiddleware(request(), undefined, () => void memo("t1"));

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("still establishes the request context it existed for", async () => {
    const { requestContext } = await import("@destaworks/config/request-context");
    let headers: Headers | undefined;

    await new Promise<void>((resolve) => {
      requestContextMiddleware(request(), undefined, () => {
        void requestContext()
          .headers()
          .then((h) => {
            headers = h;
            resolve();
          });
      });
    });

    expect(headers?.get("cookie")).toBe("session=abc");
  });
});
