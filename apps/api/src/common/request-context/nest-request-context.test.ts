import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The Nest adapter for the `RequestContext` port. Both halves of "fails closed" are asserted here,
 * because they are the difference between an unauthenticated request being refused and it being
 * mistaken for one that simply sent no credentials:
 *
 *  - reading outside a request scope THROWS rather than answering with empty headers;
 *  - with no adapter installed the port THROWS rather than falling back.
 */

vi.mock("server-only", () => ({}));

import { requestContext } from "@destaworks/config/request-context";
import {
  installNestRequestContext,
  nestRequestContext,
  runWithRequestContext,
} from "./nest-request-context";
import { requestContextMiddleware } from "./request-context.middleware";

/**
 * The port keeps its adapter in a `Symbol.for` slot on `globalThis` so one bundle-duplicated module
 * still sees one adapter. That makes it process-global, and this file needs to observe the
 * uninstalled state, so it snapshots and restores the slot around every test rather than leaking
 * an adapter into (or out of) the other suites sharing this worker.
 */
const SLOT = Symbol.for("destaworks.request-context");
type Slot = { [SLOT]?: unknown };
let saved: unknown;

beforeEach(() => {
  saved = (globalThis as Slot)[SLOT];
  delete (globalThis as Slot)[SLOT];
});

afterEach(() => {
  (globalThis as Slot)[SLOT] = saved;
});

describe("nestRequestContext — inside a request scope", () => {
  it("exposes the request's headers as a Headers object", async () => {
    const headers = await runWithRequestContext({ headers: { authorization: "Bearer t" } }, () =>
      nestRequestContext.headers(),
    );
    expect(headers.get("authorization")).toBe("Bearer t");
  });

  it("appends every value of a repeated header", async () => {
    const headers = await runWithRequestContext(
      { headers: { "x-forwarded-for": ["a", "b"] } },
      () => nestRequestContext.headers(),
    );
    expect(headers.get("x-forwarded-for")).toBe("a, b");
  });

  it("reads one cookie out of the Cookie header", async () => {
    const request = { headers: { cookie: "other=1; portal_token=abc123; last=2" } };
    const value = await runWithRequestContext(request, () =>
      nestRequestContext.cookie("portal_token"),
    );
    expect(value).toBe("abc123");
  });

  it("keeps a cookie value that itself contains '='", async () => {
    const request = { headers: { cookie: "session=a=b=c" } };
    expect(await runWithRequestContext(request, () => nestRequestContext.cookie("session"))).toBe(
      "a=b=c",
    );
  });

  it("URL-decodes a cookie value, and survives one that will not decode", async () => {
    const encoded = { headers: { cookie: "v=a%20b" } };
    expect(await runWithRequestContext(encoded, () => nestRequestContext.cookie("v"))).toBe("a b");

    const malformed = { headers: { cookie: "v=%zz" } };
    expect(await runWithRequestContext(malformed, () => nestRequestContext.cookie("v"))).toBe(
      "%zz",
    );
  });

  it("is undefined for a cookie that is not set, and when no Cookie header is sent", async () => {
    const withHeader = { headers: { cookie: "other=1" } };
    expect(
      await runWithRequestContext(withHeader, () => nestRequestContext.cookie("portal_token")),
    ).toBeUndefined();

    const withoutHeader = { headers: {} };
    expect(
      await runWithRequestContext(withoutHeader, () => nestRequestContext.cookie("portal_token")),
    ).toBeUndefined();
  });

  it("does not leak one request's headers into a concurrently-running one", async () => {
    const read = (token: string): Promise<string | null> =>
      runWithRequestContext({ headers: { authorization: token } }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return (await nestRequestContext.headers()).get("authorization");
      });

    expect(await Promise.all([read("first"), read("second")])).toEqual(["first", "second"]);
  });
});

describe("nestRequestContext — outside a request scope (fails closed)", () => {
  it("throws rather than answering with empty headers", async () => {
    await expect(nestRequestContext.headers()).rejects.toThrow(/No request is in scope/);
  });

  it("throws rather than answering that the cookie is absent", async () => {
    await expect(nestRequestContext.cookie("portal_token")).rejects.toThrow(
      /No request is in scope/,
    );
  });
});

describe("installNestRequestContext", () => {
  it("throws from the port when nothing has been installed", () => {
    expect(() => requestContext()).toThrow(/No RequestContext adapter installed/);
  });

  it("installs the Nest adapter for the port", async () => {
    installNestRequestContext();
    const headers = await runWithRequestContext({ headers: { "x-test": "1" } }, () =>
      requestContext().headers(),
    );
    expect(headers.get("x-test")).toBe("1");
  });
});

describe("requestContextMiddleware", () => {
  it("puts the request in scope for everything downstream of it", async () => {
    installNestRequestContext();
    let seen: string | null = null;

    await new Promise<void>((resolve) => {
      requestContextMiddleware({ headers: { "x-test": "downstream" } }, undefined, () => {
        void requestContext()
          .headers()
          .then((headers) => {
            seen = headers.get("x-test");
            resolve();
          });
      });
    });

    expect(seen).toBe("downstream");
  });
});
