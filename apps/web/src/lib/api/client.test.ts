import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteJson, getJson, patchJson, postJson, putJson } from "./client";

/**
 * The browser half's traffic switch (SAAS-RESTRUCTURE-PLAN 4.3). Every case here is about WHERE a
 * call goes and WHAT it carries, so each asserts the exact arguments `fetch` received.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function calledWith(): [string, RequestInit] {
  const call = fetchMock.mock.calls[0];
  expect(call).toBeDefined();
  return call as unknown as [string, RequestInit];
}

describe("with NEXT_PUBLIC_API_URL unset", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  });

  // Phase 4.3 deleted the App Router handlers, so a relative `/api/...` resolves to nothing. A
  // fallback would 404 with an HTML error page the envelope parser cannot read; this says why.
  it("refuses a data call rather than falling back to a route that no longer exists", async () => {
    await expect(getJson("/api/candidates?track=Clinical")).rejects.toThrow(
      /NEXT_PUBLIC_API_URL is not set/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a mutation the same way", async () => {
    await expect(postJson("/api/candidates", { fullName: "A" })).rejects.toThrow(
      /NEXT_PUBLIC_API_URL is not set/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps /api/auth relative", async () => {
    await postJson("/api/auth/sign-in/email", {});
    const [url] = calledWith();
    expect(url).toBe("/api/auth/sign-in/email");
  });
});

describe("with NEXT_PUBLIC_API_URL set", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
  });

  it("rewrites an /api path to an absolute URL on the API host, without the /api segment", async () => {
    await getJson("/api/candidates?track=Clinical");
    const [url] = calledWith();
    expect(url).toBe("https://api.example.test/candidates?track=Clinical");
  });

  it("sends credentials so the session cookie survives the cross-origin hop", async () => {
    await getJson("/api/candidates");
    const [, init] = calledWith();
    expect(init.credentials).toBe("include");
  });

  it("keeps /api/auth relative and uncredentialed — Better Auth is mounted in apps/web", async () => {
    await postJson("/api/auth/sign-in/email", { email: "a@b.test" });
    const [url, init] = calledWith();
    expect(url).toBe("/api/auth/sign-in/email");
    expect(init.credentials).toBeUndefined();
  });

  it("keeps the bare /api/auth path relative too", async () => {
    await getJson("/api/auth");
    const [url] = calledWith();
    expect(url).toBe("/api/auth");
  });

  it("rewrites for every verb, preserving method and body", async () => {
    await patchJson("/api/candidates/c1", { stage: "1" });
    expect(calledWith()[0]).toBe("https://api.example.test/candidates/c1");
    expect(calledWith()[1].method).toBe("PATCH");

    fetchMock.mockClear();
    await putJson("/api/client-match-profiles/x1", { state: 20 });
    expect(calledWith()[0]).toBe("https://api.example.test/client-match-profiles/x1");
    expect(calledWith()[1].method).toBe("PUT");

    fetchMock.mockClear();
    await deleteJson("/api/saved-views/v1");
    expect(calledWith()[0]).toBe("https://api.example.test/saved-views/v1");
    expect(calledWith()[1].method).toBe("DELETE");
    expect(calledWith()[1].credentials).toBe("include");
  });

  it("passes an abort signal through unchanged", async () => {
    const controller = new AbortController();
    await getJson("/api/alerts", controller.signal);
    const [, init] = calledWith();
    expect(init.signal).toBe(controller.signal);
    expect(init.credentials).toBe("include");
  });

  it("honours a base that carries a path segment", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/v1");
    await getJson("/api/candidates");
    expect(calledWith()[0]).toBe("https://api.example.test/v1/candidates");
  });

  it("leaves a URL that is not an /api path alone", async () => {
    await getJson("/portal/data");
    expect(calledWith()[0]).toBe("/portal/data");
  });

  it("falls back to the relative URL when the base is unparseable", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "not a url");
    await getJson("/api/candidates");
    const [url, init] = calledWith();
    expect(url).toBe("/api/candidates");
    expect(init.credentials).toBeUndefined();
  });
});
