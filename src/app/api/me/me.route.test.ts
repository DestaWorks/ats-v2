import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * End-to-end proof of the guarded route path (IMPLEMENTATION-PLAN 0.4 done-when): with no
 * session the route returns 401 JSON (the `AppError("UNAUTHORIZED")` thrown by `requireUser`
 * mapped by `apiHandler`), and with a valid mocked session it returns 200 + the user JSON.
 * Mocks mirror guards.test.ts: neutralize `server-only`, stub `next/headers`, drive the
 * Better Auth session — the role always originates from the (mocked) session.
 */

let mockSession: { user: { id: string; email: string; name: string; role?: string } } | null = null;

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: { api: { getSession: async () => mockSession } },
}));

import { GET } from "./route";

const req = () => new Request("http://localhost/api/me");

beforeEach(() => {
  mockSession = null;
});

describe("GET /api/me — guarded route", () => {
  it("returns 401 JSON when there is no session", async () => {
    const res = await GET(req(), undefined);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Sign in required" },
    });
  });

  it("returns 200 + the current user with a valid session", async () => {
    mockSession = { user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Owner" } };
    const res = await GET(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "u1",
      email: "u@desta.works",
      name: "Test User",
      role: "Owner",
    });
  });
});
