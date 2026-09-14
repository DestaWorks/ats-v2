import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installRequestContext } from "@destaworks/config/request-context";
import { listPlatformTenants, platformApiUrl, readFailure } from "./platform-api";

function withHeaders(init: Record<string, string>): void {
  const headers = new Headers(init);
  installRequestContext({
    headers: async () => headers,
    cookie: async (name) => (name === "" ? undefined : undefined),
  });
}

beforeEach(() => {
  withHeaders({ cookie: "better-auth.session_token=abc" });
  process.env["PLATFORM_API_URL"] = "https://api.example.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["PLATFORM_API_URL"];
});

describe("platformApiUrl", () => {
  it("joins a path onto a base without a trailing slash", () => {
    expect(platformApiUrl("/platform/tenants", "https://api.example.test")).toBe(
      "https://api.example.test/platform/tenants",
    );
  });

  it("keeps a base that already has a trailing slash or a path prefix", () => {
    expect(platformApiUrl("/platform/tenants", "https://api.example.test/v1/")).toBe(
      "https://api.example.test/v1/platform/tenants",
    );
  });

  it("returns null for an unset, blank or unparseable base", () => {
    expect(platformApiUrl("/platform/tenants", undefined)).toBeNull();
    expect(platformApiUrl("/platform/tenants", "   ")).toBeNull();
    expect(platformApiUrl("/platform/tenants", "not a url")).toBeNull();
  });
});

describe("readFailure", () => {
  it("reads the API's error envelope", async () => {
    const res = new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "No." } }), {
      status: 403,
    });
    expect(await readFailure(res)).toEqual({ code: "FORBIDDEN", message: "No.", issues: [] });
  });

  it("does not surface a non-JSON body as a message", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", { status: 502 });
    const failure = await readFailure(res);
    expect(failure.code).toBe("UNKNOWN");
    expect(failure.message).not.toContain("html");
  });
});

describe("listPlatformTenants", () => {
  it("forwards the caller's cookie and never caches the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tenants: [] })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPlatformTenants();

    expect(result).toEqual({ ok: true, data: { tenants: [] } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/platform/tenants");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("cookie")).toBe("better-auth.session_token=abc");
  });

  it("omits the cookie header entirely when the request carries none", async () => {
    withHeaders({});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tenants: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await listPlatformTenants();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).has("cookie")).toBe(false);
  });

  it("reports a misconfigured base without issuing a request", async () => {
    delete process.env["PLATFORM_API_URL"];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await listPlatformTenants();

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns an unreachable API into a failure rather than a rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED 10.0.0.1:3004");
      }),
    );

    const result = await listPlatformTenants();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("NETWORK");
    expect(result.failure.message).not.toContain("10.0.0.1");
  });

  it("passes a 403 through as the API stated it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Denied" } }), {
            status: 403,
          }),
      ),
    );

    const result = await listPlatformTenants();

    expect(result).toEqual({
      ok: false,
      failure: { code: "FORBIDDEN", message: "Denied", issues: [] },
    });
  });
});
