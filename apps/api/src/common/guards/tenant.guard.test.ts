import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `TenantGuard` — the transport half of tenant resolution.
 *
 * Only the membership repository is mocked, so the REAL claim reader and the REAL
 * `requireTenantContext` run: these cases prove the guard gathers the three request facts
 * correctly and then decides nothing itself. A forged claim reaching this guard is refused by the
 * same code path a forged claim reaching anything else is refused by.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ findByUserAndSlug: vi.fn(), listByUser: vi.fn() }));

vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  membershipRepository: {
    findByUserAndSlug: h.findByUserAndSlug,
    listByUser: h.listByUser,
  },
}));

import { installNestRequestContext } from "../request-context/nest-request-context";
import { executionContextFor } from "./testing/execution-context.fixture";
import { TenantGuard } from "./tenant.guard";
import type { TenantScopedRequest } from "./authenticated-request";
import type { AuthContext, AuthUser } from "@destaworks/auth/guards";

installNestRequestContext();

const guard = new TenantGuard();

const identity: AuthUser = { id: "u1", email: "jane@desta.works", name: "Jane Doe" };

/**
 * What `SessionAuthGuard` leaves on the request: a full context, not a bare user. The tenant on it
 * came from a hint, which is exactly why `TenantGuard` re-resolves rather than trusting it.
 */
const user: AuthContext = {
  user: identity,
  tenantId: "t-hint",
  membershipId: "m-hint",
  role: "Associate",
};

function membership(slug: string, overrides: { role?: string; status?: string } = {}) {
  return {
    id: `m-${slug}`,
    tenantId: `t-${slug}`,
    userId: "u1",
    role: overrides.role ?? "Associate",
    status: overrides.status ?? "active",
    invitedById: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    tenant: {
      id: `t-${slug}`,
      slug,
      name: slug,
      status: "active",
      deletedAt: null,
    },
  };
}

function requestFor(options: {
  host?: string;
  url?: string;
  cookie?: string;
  authenticated?: boolean;
}): TenantScopedRequest {
  const headers: Record<string, string> = {};
  if (options.host !== undefined) headers["host"] = options.host;
  if (options.cookie !== undefined) headers["cookie"] = `dw_tenant=${options.cookie}`;
  return {
    headers,
    url: options.url ?? "/pipeline",
    ...(options.authenticated === false ? {} : { user }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.findByUserAndSlug.mockImplementation(async (_userId: string, slug: string) =>
    slug === "acme" ? membership("acme", {}) : null,
  );
  h.listByUser.mockResolvedValue([]);
});

describe("TenantGuard", () => {
  it("refuses a request no auth guard has run on, rather than resolving one itself", async () => {
    const request = requestFor({ authenticated: false, cookie: "acme" });

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(request.tenant).toBeUndefined();
    expect(h.findByUserAndSlug).not.toHaveBeenCalled();
  });

  it("resolves a tenant from the subdomain and attaches it, role from the membership", async () => {
    const request = requestFor({ host: "acme.desta.works" });

    await expect(guard.canActivate(executionContextFor({ request }))).resolves.toBe(true);

    expect(request.tenant).toMatchObject({ tenantId: "t-acme" });
  });

  it("resolves from the cookie when the URL names nothing", async () => {
    const request = requestFor({ host: "app.desta.works", cookie: "acme" });

    await guard.canActivate(executionContextFor({ request }));

    expect(h.findByUserAndSlug).toHaveBeenCalledWith("u1", "acme");
  });

  it("lets the path win over a cookie pointing somewhere else", async () => {
    const request = requestFor({
      host: "app.desta.works",
      url: "/t/acme/pipeline",
      cookie: "boom",
    });

    await guard.canActivate(executionContextFor({ request }));

    expect(h.findByUserAndSlug).toHaveBeenCalledTimes(1);
    expect(h.findByUserAndSlug).toHaveBeenCalledWith("u1", "acme");
  });

  it("refuses a forged cookie naming a workspace the user is not in, and attaches nothing", async () => {
    const request = requestFor({ host: "app.desta.works", cookie: "northwind" });

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(request.tenant).toBeUndefined();
  });

  it("prefers `originalUrl` so a mounted path cannot silently drop the claim", async () => {
    const request: TenantScopedRequest = {
      headers: { host: "app.desta.works" },
      url: "/pipeline",
      originalUrl: "/t/acme/pipeline",
      user,
    };

    await guard.canActivate(executionContextFor({ request }));

    expect(h.findByUserAndSlug).toHaveBeenCalledWith("u1", "acme");
  });

  it("asks the user to choose when nothing names a tenant and they belong to several", async () => {
    h.listByUser.mockResolvedValue([membership("acme"), membership("northwind")]);
    const request = requestFor({ host: "app.desta.works" });

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    });
  });
});
