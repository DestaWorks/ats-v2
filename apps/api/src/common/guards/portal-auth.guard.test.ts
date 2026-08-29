import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PortalAuthGuard` — the external client-contact identity, which is not a session and not a role.
 *
 * Every case here holds a token that is live, unexpired and unrevoked, and must still be refused.
 * Audit 2026-08-21 found a contact marked `left` in the CRM kept 30 days of access to that client's
 * candidate roster on exactly such a token, so `status: "left"` and `portalEnabled: false` are
 * access-control rules re-checked on every request — not edge cases.
 *
 * Mocks only the token repository, so the real `requirePortalContact` predicate chain runs.
 */

vi.mock("server-only", () => ({}));

type ContactRow = {
  id: string;
  clientId: string;
  fullName: string;
  email: string | null;
  status: string;
  portalEnabled: boolean;
  deletedAt: Date | null;
};

type TokenRow = { id: string; revokedAt: Date | null; expiresAt: Date; contact: ContactRow };

let mockToken: TokenRow | null = null;
const touchLastUsed = vi.fn();

vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  tenantRepository: { findBySlug: async (slug: string) => (slug === "acme" ? { id: "t1" } : null) },
}));

vi.mock("@destaworks/db/repositories/client-portal-token.repository", () => ({
  clientPortalTokenRepository: {
    findByHash: async () => mockToken,
    touchLastUsed: (...args: unknown[]) => touchLastUsed(...args),
  },
}));

import { PORTAL_TOKEN_COOKIE } from "@destaworks/domain/constants";
import { installNestRequestContext } from "../request-context/nest-request-context";
import { executionContextFor } from "./testing/execution-context.fixture";
import { PortalAuthGuard } from "./portal-auth.guard";
import type { AuthenticatedRequest, PortalRequest } from "./authenticated-request";

installNestRequestContext();

const guard = new PortalAuthGuard();

/** A request carrying a well-formed portal cookie — valid as far as the transport is concerned. */
function requestWithCookie(): PortalRequest {
  return { headers: { cookie: `${PORTAL_TOKEN_COOKIE}=raw-token`, host: "acme.desta.works" } };
}

function tokenFor(contact: Partial<ContactRow> = {}, token: Partial<TokenRow> = {}): TokenRow {
  return {
    id: "tok_1",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...token,
    contact: {
      id: "contact_1",
      clientId: "client_1",
      fullName: "Dana Client",
      email: "dana@client.example",
      status: "active",
      portalEnabled: true,
      deletedAt: null,
      ...contact,
    },
  };
}

beforeEach(() => {
  mockToken = null;
  touchLastUsed.mockClear();
});

describe("PortalAuthGuard — refusals on a live cookie", () => {
  it("refuses a contact who has left the client, and does not touch the token", async () => {
    mockToken = tokenFor({ status: "left" });
    const request = requestWithCookie();

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(request.portal).toBeUndefined();
    expect(touchLastUsed).not.toHaveBeenCalled();
  });

  it("refuses a contact whose portal access is not enabled", async () => {
    mockToken = tokenFor({ portalEnabled: false });
    const request = requestWithCookie();

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(request.portal).toBeUndefined();
    expect(touchLastUsed).not.toHaveBeenCalled();
  });

  it("refuses revoked, expired, soft-deleted and unknown tokens", async () => {
    const cases: Array<[string, TokenRow | null]> = [
      ["revoked", tokenFor({}, { revokedAt: new Date() })],
      ["expired", tokenFor({}, { expiresAt: new Date(Date.now() - 1000) })],
      ["deleted contact", tokenFor({ deletedAt: new Date() })],
      ["unknown", null],
    ];

    for (const [label, token] of cases) {
      mockToken = token;
      const request = requestWithCookie();
      await expect(
        guard.canActivate(executionContextFor({ request })),
        label,
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(request.portal, label).toBeUndefined();
    }
  });
});

describe("PortalAuthGuard — no cookie", () => {
  it("refuses a request that sends no portal cookie, even with a resolvable token in the store", async () => {
    mockToken = tokenFor();
    const request: PortalRequest = { headers: {} };

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("ignores a token supplied anywhere other than the cookie", async () => {
    mockToken = tokenFor();
    // The legacy IDOR was trusting a client-supplied identity. A query string or body cannot
    // authenticate here: identity comes from the cookie the guard reads, or from nowhere.
    const request: PortalRequest = { headers: { "x-portal-token": "raw-token" } };

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("PortalAuthGuard — no RequestContext adapter", () => {
  it("refuses rather than admitting when bootstrap installed no adapter", async () => {
    // The port throws instead of falling back, so a missing adapter cannot be mistaken for a
    // request that simply sent no cookie. The guard must let that stand as a denial.
    const slot = Symbol.for("destaworks.request-context");
    type Slot = { [slot]?: unknown };
    const saved = (globalThis as Slot)[slot];
    delete (globalThis as Slot)[slot];
    try {
      mockToken = tokenFor();
      const request = requestWithCookie();
      await expect(guard.canActivate(executionContextFor({ request }))).rejects.toThrow(
        /No RequestContext adapter installed/,
      );
      expect(request.portal).toBeUndefined();
    } finally {
      (globalThis as Slot)[slot] = saved;
    }
  });
});

describe("PortalAuthGuard — grant", () => {
  it("admits an active, portal-enabled contact from the cookie alone", async () => {
    mockToken = tokenFor();
    const request = requestWithCookie();

    expect(await guard.canActivate(executionContextFor({ request }))).toBe(true);
    expect(request.portal).toEqual({
      contactId: "contact_1",
      clientId: "client_1",
      fullName: "Dana Client",
      email: "dana@client.example",
    });
  });

  it("never grants a session identity — the two never merge", async () => {
    mockToken = tokenFor();
    const request: PortalRequest & AuthenticatedRequest = requestWithCookie();

    await guard.canActivate(executionContextFor({ request }));

    expect(request.user).toBeUndefined();
    expect(request.portal).not.toHaveProperty("role");
  });
});
