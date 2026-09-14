import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Portal token resolution (Wave 4.3). Mirrors `guards.test.ts`'s approach: mock the repository and
 * install a stub `RequestContext` so the test exercises the *guard predicates* without a DB. Every
 * case here is a reason a live, unexpired, unrevoked token must still be refused — audit
 * 2026-08-21 found a contact marked `left` in the CRM kept 30 days of access to the client's
 * candidate roster.
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

type TokenRow = {
  id: string;
  revokedAt: Date | null;
  expiresAt: Date;
  contact: ContactRow;
};

let mockToken: TokenRow | null = null;
let mockTenant: { id: string; status: string; deletedAt: Date | null } | null = null;
const touchLastUsed = vi.fn();

vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  tenantRepository: {
    findBySlug: async (slug: string) => (slug === "acme" ? mockTenant : null),
  },
}));

vi.mock("@destaworks/db/repositories/client-portal-token.repository", () => ({
  clientPortalTokenRepository: {
    findByHash: async () => mockToken,
    touchLastUsed: (...args: unknown[]) => touchLastUsed(...args),
  },
}));

import { PORTAL_TOKEN_COOKIE } from "@destaworks/domain/constants";
import { installRequestContext } from "@destaworks/config/request-context";
import { exchangePortalToken, resolvePortalContact, hashPortalToken } from "./portal-guards";

let mockCookie: string | undefined;

installRequestContext({
  headers: async () => new Headers({ host: "acme.desta.works" }),
  cookie: async (name) => (name === PORTAL_TOKEN_COOKIE ? mockCookie : undefined),
});

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
  mockTenant = { id: "t1", status: "active", deletedAt: null };
  mockToken = null;
  mockCookie = undefined;
  touchLastUsed.mockClear();
});

describe("exchangePortalToken", () => {
  it("resolves a live token for an active, portal-enabled contact", async () => {
    mockToken = tokenFor();
    const result = await exchangePortalToken("raw-token");
    expect(result?.contact).toEqual({
      contactId: "contact_1",
      clientId: "client_1",
      fullName: "Dana Client",
      email: "dana@client.example",
    });
  });

  it("refuses a contact who has left the client", async () => {
    mockToken = tokenFor({ status: "left" });
    expect(await exchangePortalToken("raw-token")).toBeNull();
    expect(touchLastUsed).not.toHaveBeenCalled();
  });

  it("refuses a contact whose portal access was never opted into", async () => {
    mockToken = tokenFor({ portalEnabled: false });
    expect(await exchangePortalToken("raw-token")).toBeNull();
  });

  it("refuses revoked, expired, deleted, and unknown tokens", async () => {
    mockToken = tokenFor({}, { revokedAt: new Date() });
    expect(await exchangePortalToken("raw-token")).toBeNull();

    mockToken = tokenFor({}, { expiresAt: new Date(Date.now() - 1000) });
    expect(await exchangePortalToken("raw-token")).toBeNull();

    mockToken = tokenFor({ deletedAt: new Date() });
    expect(await exchangePortalToken("raw-token")).toBeNull();

    mockToken = null;
    expect(await exchangePortalToken("raw-token")).toBeNull();
  });
});

describe("a suspended workspace closes the portal too", () => {
  it("refuses a live token when the tenant is suspended", async () => {
    mockToken = tokenFor();
    mockTenant = { id: "t1", status: "suspended", deletedAt: null };
    expect(await exchangePortalToken("raw-token")).toBeNull();
  });

  it("refuses a live token when the tenant is soft-deleted", async () => {
    mockToken = tokenFor();
    mockTenant = { id: "t1", status: "active", deletedAt: new Date() };
    expect(await exchangePortalToken("raw-token")).toBeNull();
  });
});

describe("resolvePortalContact", () => {
  it("resolves identity from the portal cookie only", async () => {
    mockToken = tokenFor();
    mockCookie = "raw-token";
    expect(await resolvePortalContact()).toMatchObject({ contactId: "contact_1" });
  });

  it("is null when the portal cookie is absent", async () => {
    mockToken = tokenFor();
    expect(await resolvePortalContact()).toBeNull();
  });

  it("refuses a departed contact who still holds the cookie", async () => {
    mockToken = tokenFor({ status: "left" });
    mockCookie = "raw-token";
    expect(await resolvePortalContact()).toBeNull();
  });
});

describe("hashPortalToken", () => {
  it("is a stable SHA-256 digest — the raw token is never what gets stored", () => {
    const digest = hashPortalToken("raw-token");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hashPortalToken("raw-token"));
    expect(digest).not.toBe(hashPortalToken("raw-token2"));
  });
});
