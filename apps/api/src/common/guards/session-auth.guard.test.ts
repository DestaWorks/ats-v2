import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `SessionAuthGuard` — the 401 half of the surface. Mocks only the leaf (the Better Auth session)
 * and installs the real Nest `RequestContext` adapter, so the real `requireUser` runs and the test
 * proves the guard's own contribution: headers reach Better Auth, the resolved user lands on the
 * request, and every path that is not a resolved session is a refusal.
 */

vi.mock("server-only", () => ({}));

let mockSession: { user: { id: string; email: string; name: string; role?: string } } | null = null;
let seenHeaders: Headers | undefined;

vi.mock("@destaworks/auth/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        seenHeaders = headers;
        return mockSession;
      },
    },
  },
}));

import { installNestRequestContext } from "../request-context/nest-request-context";
import { executionContextFor } from "./testing/execution-context.fixture";
import { SessionAuthGuard } from "./session-auth.guard";
import type { AuthenticatedRequest } from "./authenticated-request";

installNestRequestContext();

const guard = new SessionAuthGuard();

function signInAs(role?: string): void {
  mockSession = {
    user: {
      id: "u1",
      email: "u@desta.works",
      name: "Test User",
      ...(role !== undefined && { role }),
    },
  };
}

beforeEach(() => {
  mockSession = null;
  seenHeaders = undefined;
});

describe("SessionAuthGuard", () => {
  it("refuses an unauthenticated request with the UNAUTHORIZED envelope", async () => {
    const request: AuthenticatedRequest = { headers: {} };
    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(request.user).toBeUndefined();
  });

  it("admits a signed-in user and attaches them to the request", async () => {
    signInAs("Owner");
    const request: AuthenticatedRequest = { headers: {} };

    expect(await guard.canActivate(executionContextFor({ request }))).toBe(true);
    expect(request.user).toMatchObject({ id: "u1", email: "u@desta.works", role: "Owner" });
  });

  it("passes the request's own headers to the session lookup", async () => {
    signInAs("Owner");
    const request: AuthenticatedRequest = { headers: { cookie: "better-auth.session_token=xyz" } };

    await guard.canActivate(executionContextFor({ request }));

    expect(seenHeaders?.get("cookie")).toBe("better-auth.session_token=xyz");
  });

  it("never trusts a forged role — an unknown one is downgraded, not honoured", async () => {
    signInAs("Superuser");
    const request: AuthenticatedRequest = { headers: {} };

    await guard.canActivate(executionContextFor({ request }));

    expect(request.user?.role).not.toBe("Superuser");
    expect(request.user?.role).toBe("Associate");
  });

  it("refuses — never admits — when no RequestContext adapter is installed", async () => {
    // A bootstrap that forgot `installNestRequestContext()`. The port throws rather than falling
    // back, and the guard must let that stand as a denial instead of returning `true`.
    const slot = Symbol.for("destaworks.request-context");
    type Slot = { [slot]?: unknown };
    const saved = (globalThis as Slot)[slot];
    delete (globalThis as Slot)[slot];
    try {
      signInAs("Owner");
      const request: AuthenticatedRequest = { headers: {} };
      await expect(guard.canActivate(executionContextFor({ request }))).rejects.toThrow(
        /No RequestContext adapter installed/,
      );
      expect(request.user).toBeUndefined();
    } finally {
      (globalThis as Slot)[slot] = saved;
    }
  });
});
