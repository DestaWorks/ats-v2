import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `PortalAccessRequestsController` — the PUBLIC half of client-portal access,
 * ported from the `portal/request-access` Server Action.
 *
 * The one route under `/portal` without `PortalAuthGuard`, because the caller is asking to become
 * a contact and holds no token yet. That is asserted here rather than assumed, alongside the
 * refusals the guard would otherwise have covered.
 */

const h = vi.hoisted(() => ({
  findBySlug: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/db/tenancy/membership.repository", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tenantRepository: { findBySlug: h.findBySlug },
}));
vi.mock("@destaworks/application/portal-access-request.service", () => ({
  portalAccessRequestService: { submit: h.submit },
}));

import { __resetRateLimit } from "@destaworks/integrations/http/rate-limit";
import { SYSTEM_ACTOR_ID } from "@destaworks/domain/system-context";
import {
  jsonBody,
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { injectedTokens, routeOf } from "../../common/testing/route-parity";
import { PUBLIC_TENANT_SERVICE } from "../tenants/tenants.tokens";
import { PortalAccessRequestsController } from "./portal-access-requests.controller";
import { PortalModule } from "./portal.module";
import { PORTAL_ACCESS_REQUEST_SERVICE } from "./portal.tokens";

const REQUESTER = {
  name: "Dana Bekele",
  email: "dana@client.example",
  requestedClientName: "Client Co",
};

const ACME = {
  id: "t-acme",
  slug: "acme",
  name: "Acme",
  status: "active",
  deletedAt: null,
  plan: "pro",
  seatLimit: null,
  trialEndsAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

let api: ContractHost;

function submitFrom(host: string | undefined, body: unknown = REQUESTER): Promise<Response> {
  const init = jsonBody(body);
  return api.request("/portal/access-requests", {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      ...(host && { "x-forwarded-host": host }),
    },
  });
}

beforeAll(async () => {
  api = await startContractHost(PortalModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  h.findBySlug.mockReset();
  h.submit.mockReset();
  __resetRateLimit();
  h.findBySlug.mockResolvedValue(ACME);
});

describe("POST /portal/access-requests — the route surface", () => {
  it("carries the limiter and nothing else: no portal, session or capability guard", () => {
    const route = routeOf(PortalAccessRequestsController, "submit");
    expect(route).toMatchObject({ method: "POST", path: "/portal/access-requests", status: 201 });
    expect(route.guards).toEqual(["RateLimitGuard"]);
    expect(route.capability).toBeUndefined();
  });

  it("injects both services by token", () => {
    expect(injectedTokens(PortalAccessRequestsController)).toEqual([
      PUBLIC_TENANT_SERVICE,
      PORTAL_ACCESS_REQUEST_SERVICE,
    ]);
  });
});

describe("POST /portal/access-requests — a submission", () => {
  it("files the request against the workspace the forwarded host names", async () => {
    const res = await submitFrom("acme.destaworks.com");

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.findBySlug).toHaveBeenCalledWith("acme");
    expect(h.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-acme",
        user: expect.objectContaining({ id: SYSTEM_ACTOR_ID }),
      }),
      REQUESTER,
    );
  });

  it("answers acceptance only — never an id or the requester's email", async () => {
    h.submit.mockResolvedValue({ id: "p1", email: REQUESTER.email });
    const res = await submitFrom("acme.destaworks.com");

    expect(JSON.stringify(await res.json())).toBe(JSON.stringify({ ok: true }));
  });
});

describe("POST /portal/access-requests — the refusals", () => {
  it("refuses when the host names no workspace at all", async () => {
    expect((await submitFrom("destaworks.com")).status).toBe(404);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("refuses an unknown workspace", async () => {
    h.findBySlug.mockResolvedValue(null);
    const res = await submitFrom("nobody.destaworks.com");

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("NOT_FOUND");
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("refuses a SUSPENDED workspace", async () => {
    h.findBySlug.mockResolvedValue({ ...ACME, status: "suspended" });
    expect((await submitFrom("acme.destaworks.com")).status).toBe(404);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("rate limits the flood before any work — same bucket, limit and window as the action", async () => {
    for (let i = 0; i < 20; i++) expect((await submitFrom("acme.destaworks.com")).status).toBe(201);

    const refused = await submitFrom("acme.destaworks.com");
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as ErrorEnvelope).error.code).toBe("RATE_LIMITED");
    expect(h.submit).toHaveBeenCalledTimes(20);
  });

  it("rejects a body carrying a tenant — the host is the only source", async () => {
    const res = await submitFrom("acme.destaworks.com", { ...REQUESTER, tenantId: "t-victim" });

    expect(res.status).toBe(422);
    expect(h.submit).not.toHaveBeenCalled();
  });
});
