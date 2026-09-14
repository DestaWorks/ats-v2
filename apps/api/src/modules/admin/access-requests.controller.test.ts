import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `AccessRequestsController` — the PUBLIC half of operator access, ported from
 * the `(auth)/request-access` Server Action.
 *
 * It runs behind the real request pipeline because the things most likely to go wrong here are not
 * in the controller: the global `AuditActorInterceptor` fails an unattributed mutation closed, and
 * an endpoint nobody can be signed in for has to pass it on a declared allowance.
 *
 * `publicTenantService` is NOT mocked — only the tenant row underneath it — so the refusals that
 * matter (no workspace, unknown slug, suspended workspace) are the real ones rather than a double's.
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
vi.mock("@destaworks/application/access-request.service", () => ({
  accessRequestService: { submit: h.submit },
}));

import { __resetRateLimit } from "@destaworks/integrations/http/rate-limit";
import { AppError } from "@destaworks/integrations/http/app-error";
import { SYSTEM_ACTOR_ID } from "@destaworks/domain/system-context";
import {
  jsonBody,
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { injectedTokens, routeOf } from "../../common/testing/route-parity";
import { PUBLIC_TENANT_SERVICE } from "../tenants/tenants.tokens";
import { AccessRequestsController } from "./access-requests.controller";
import { AdminModule } from "./admin.module";
import { ACCESS_REQUEST_SERVICE } from "./admin.tokens";

const APPLICANT = { name: "Sam Adera", email: "sam@example.com" };

/** A live workspace as `tenantRepository.findBySlug` returns it. */
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

/** Post the form the way `apps/web` does: the visitor's host forwarded, nothing else. */
function submitFrom(host: string | undefined, body: unknown = APPLICANT): Promise<Response> {
  const init = jsonBody(body);
  return api.request("/access-requests", {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      ...(host && { "x-forwarded-host": host }),
    },
  });
}

beforeAll(async () => {
  api = await startContractHost(AdminModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  // `mockReset`, not `clearAllMocks`: a rejection set by one test would otherwise outlive it.
  h.findBySlug.mockReset();
  h.submit.mockReset();
  __resetRateLimit();
  h.findBySlug.mockResolvedValue(ACME);
});

describe("POST /access-requests — the route surface", () => {
  it("is public: no session, portal or capability guard, only the limiter", () => {
    const route = routeOf(AccessRequestsController, "submit");
    expect(route).toMatchObject({ method: "POST", path: "/access-requests", status: 201 });
    expect(route.guards).toEqual(["RateLimitGuard"]);
    expect(route.capability).toBeUndefined();
  });

  it("injects both services by token — never the imported singletons", () => {
    expect(injectedTokens(AccessRequestsController)).toEqual([
      PUBLIC_TENANT_SERVICE,
      ACCESS_REQUEST_SERVICE,
    ]);
  });
});

describe("POST /access-requests — a submission", () => {
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
      APPLICANT,
    );
  });

  it("answers acceptance only — never the row, an id, or the applicant's details", async () => {
    h.submit.mockResolvedValue({ id: "req-1", email: APPLICANT.email, name: APPLICANT.name });
    const res = await submitFrom("acme.destaworks.com");
    const body = JSON.stringify(await res.json());

    expect(body).toBe(JSON.stringify({ ok: true }));
    expect(body).not.toContain(APPLICANT.email);
  });

  it("passes the service's CONFLICT through, so a duplicate still reaches the form", async () => {
    h.submit.mockRejectedValue(new AppError("CONFLICT", "You already have a pending request"));
    const res = await submitFrom("acme.destaworks.com");

    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("CONFLICT");
  });
});

describe("POST /access-requests — the refusals", () => {
  it("refuses when the host names no workspace at all", async () => {
    const res = await submitFrom("destaworks.com");

    expect(res.status).toBe(404);
    expect(h.findBySlug).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("refuses an unknown workspace", async () => {
    h.findBySlug.mockResolvedValue(null);
    const res = await submitFrom("nobody.destaworks.com");

    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("NOT_FOUND");
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("refuses a SUSPENDED workspace — suspension bites on this door too", async () => {
    h.findBySlug.mockResolvedValue({ ...ACME, status: "suspended" });
    const res = await submitFrom("acme.destaworks.com");

    expect(res.status).toBe(404);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("refuses a deleted workspace for the same reason", async () => {
    h.findBySlug.mockResolvedValue({ ...ACME, deletedAt: new Date("2026-02-01T00:00:00.000Z") });
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
});

describe("POST /access-requests — the tenant is not a field of the form", () => {
  it("rejects a body carrying a tenant instead of silently ignoring it", async () => {
    const res = await submitFrom("acme.destaworks.com", { ...APPLICANT, tenantId: "t-victim" });

    expect(res.status).toBe(422);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("cannot be steered by a slug in the body — the host is the only source", async () => {
    const res = await submitFrom("acme.destaworks.com", { ...APPLICANT, slug: "victim" });

    expect(res.status).toBe(422);
    expect(h.findBySlug).not.toHaveBeenCalledWith("victim");
    expect(h.submit).not.toHaveBeenCalled();
  });
});
