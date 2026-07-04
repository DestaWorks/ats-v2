import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves server-side authZ (IMPLEMENTATION-PLAN 0.3 done-when: "a non-admin provably
 * can't reach admin"). We mock the Better Auth session + `next/headers` so the test
 * exercises the *guard logic* — role validation + capability/role checks — without a DB
 * or HTTP layer. The role always originates from the (mocked) session, never the caller.
 */

// Controllable session for the mocked Better Auth instance.
let mockSession: { user: { id: string; email: string; name: string; role?: string } } | null = null;

// `server-only` throws outside a React Server Component build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("./auth", () => ({
  auth: { api: { getSession: async () => mockSession } },
}));

import { getCurrentUser, requireUser, requireCapability } from "./guards";

function signInAs(role?: string) {
  mockSession = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeEach(() => {
  mockSession = null;
});

describe("auth guards — server-side authorization", () => {
  it("getCurrentUser returns null with no session", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("requireUser throws UNAUTHORIZED when signed out", async () => {
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("coerces an unknown/forged role to Associate (role is never trusted verbatim)", async () => {
    signInAs("Superuser"); // not a member of the fixed Role enum
    expect((await getCurrentUser())?.role).toBe("Associate");
  });

  it("defaults a session with no role to Associate", async () => {
    signInAs(undefined);
    expect((await getCurrentUser())?.role).toBe("Associate");
  });

  it("blocks a non-leadership role from a leadership capability", async () => {
    signInAs("Associate");
    await expect(requireCapability("viewReports")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admits a leadership role through the same capability", async () => {
    signInAs("Owner");
    expect((await requireCapability("viewReports")).role).toBe("Owner");
  });
});
