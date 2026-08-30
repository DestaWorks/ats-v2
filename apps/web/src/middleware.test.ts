import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionCookie = vi.fn<(request: unknown) => string | null>();

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: (request: unknown) => getSessionCookie(request),
}));

const { config, middleware } = await import("./middleware");

/**
 * Next compiles `config.matcher` with path-to-regexp; the entries here are a bare capture group
 * whose body is already plain regex syntax, so anchoring the string reproduces the same decision
 * without pulling the compiler in.
 */
function matches(pathname: string): boolean {
  return config.matcher.some((entry) => new RegExp(`^${entry}$`).test(pathname));
}

beforeEach(() => {
  getSessionCookie.mockReset();
});

describe("middleware matcher", () => {
  it("leaves the Better Auth catch-all alone", () => {
    expect(matches("/api/auth/session")).toBe(false);
    expect(matches("/api/auth/sign-in/email")).toBe(false);
    expect(matches("/api/auth/callback/google")).toBe(false);
  });

  it("leaves the signed-out pages alone so the redirect cannot loop", () => {
    expect(matches("/sign-in")).toBe(false);
    expect(matches("/forgot-password")).toBe(false);
    expect(matches("/reset-password")).toBe(false);
    expect(matches("/request-access")).toBe(false);
  });

  it("leaves the client portal alone — it carries its own token, not a staff session", () => {
    expect(matches("/portal")).toBe(false);
    expect(matches("/portal/access")).toBe(false);
    expect(matches("/portal/request-access")).toBe(false);
  });

  it("leaves build output and the favicon alone", () => {
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });

  it("still covers every staff route, including the root and a tenant-prefixed path", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/candidates/abc123")).toBe(true);
    expect(matches("/pipeline")).toBe(true);
    expect(matches("/admin")).toBe(true);
    expect(matches("/t/acme/dashboard")).toBe(true);
  });
});

describe("middleware", () => {
  it("redirects to sign-in when no session cookie is present", () => {
    getSessionCookie.mockReturnValue(null);
    const response = middleware(new NextRequest("https://ats.example.com/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://ats.example.com/sign-in");
  });

  it("passes the request through when a session cookie is present", () => {
    getSessionCookie.mockReturnValue("a-session-token");
    const response = middleware(new NextRequest("https://ats.example.com/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
