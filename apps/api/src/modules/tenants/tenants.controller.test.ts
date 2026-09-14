import "reflect-metadata";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `TenantsController` — the switch endpoint, which is the one place a tenant claim is turned into
 * something the browser will keep sending.
 *
 * The service is mocked because its verification has its own suite. What is asserted here is the
 * transport's contribution and its ordering: the cookie is written only AFTER the service returns,
 * it carries the slug the SERVER resolved rather than the one the client sent, and a refusal
 * leaves no `Set-Cookie` behind at all.
 */

const h = vi.hoisted(() => ({
  memberships: {
    listForUser: vi.fn(),
    switchTenant: vi.fn(),
    acceptInvitation: vi.fn(),
    listMembers: vi.fn(),
    invite: vi.fn(),
    changeRole: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/membership.service", () => ({ membershipService: h.memberships }));

import { AppError } from "@destaworks/integrations/http/app-error";
import { membershipService } from "@destaworks/application/membership.service";
import type { AuthUser } from "@destaworks/auth/guards";
import { TenantsController, type CookieResponseLike } from "./tenants.controller";

const user: AuthUser = { id: "u1", email: "jane@desta.works", name: "Jane Doe" };

const controller = new TenantsController(membershipService);

function recordingResponse(): CookieResponseLike & {
  calls: { name: string; value: string; options: Record<string, unknown> }[];
} {
  const calls: { name: string; value: string; options: Record<string, unknown> }[] = [];
  return {
    calls,
    cookie(name: string, value: string, options: Record<string, unknown>) {
      calls.push({ name, value, options });
      return undefined;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /tenants/switch", () => {
  it("writes the slug the SERVER resolved, not the one the client sent", async () => {
    h.memberships.switchTenant.mockResolvedValue({
      tenant: {
        tenantId: "t1",
        slug: "acme",
        name: "Acme Health",
        status: "active",
      },
    });
    const response = recordingResponse();

    await controller.switch({ tenant: "acme" }, user, response);

    expect(response.calls).toHaveLength(1);
    expect(response.calls[0]?.name).toBe("dw_tenant");
    expect(response.calls[0]?.value).toBe("acme");
    expect(response.calls[0]?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("sets NO cookie when the service refuses the workspace", async () => {
    h.memberships.switchTenant.mockRejectedValue(
      new AppError("FORBIDDEN", "You don't have access to that workspace"),
    );
    const response = recordingResponse();

    await expect(controller.switch({ tenant: "northwind" }, user, response)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(response.calls).toHaveLength(0);
  });

  it("passes the signed-in user through untouched — identity never comes from the body", async () => {
    h.memberships.switchTenant.mockResolvedValue({
      tenant: {
        tenantId: "t1",
        slug: "acme",
        name: "Acme Health",
        status: "active",
      },
    });

    await controller.switch({ tenant: "acme" }, user, recordingResponse());

    expect(h.memberships.switchTenant).toHaveBeenCalledWith(user, { tenant: "acme" });
  });
});

describe("the member routes forward the resolved context, not a client-supplied tenant", () => {
  const tenant = {
    tenantId: "t1",
    membershipId: "m1",
    modules: MODULES,
    capabilities: ROLE_CAPABILITIES.Owner,
    user: { id: "u1", email: "jane@desta.works", name: "Jane Doe" },
    role: "Owner" as const,
  };

  it("invite passes the TenantContext through", async () => {
    h.memberships.invite.mockResolvedValue({ member: {} });

    await controller.invite({ email: "john@desta.works", roleId: "ar_Associate" }, tenant);

    expect(h.memberships.invite).toHaveBeenCalledWith(tenant, {
      email: "john@desta.works",
      roleId: "ar_Associate",
    });
  });

  it("changeRole passes the TenantContext, the path id and the validated body", async () => {
    h.memberships.changeRole.mockResolvedValue({ member: {} });

    await controller.changeRole("m2", { roleId: "ar_Manager" }, tenant);

    expect(h.memberships.changeRole).toHaveBeenCalledWith(tenant, "m2", { roleId: "ar_Manager" });
  });

  it("remove passes the TenantContext and the path id, and nothing else", async () => {
    h.memberships.remove.mockResolvedValue({ member: {} });

    await controller.remove("m2", tenant);

    expect(h.memberships.remove).toHaveBeenCalledWith(tenant, "m2");
  });

  it("accept takes only the signed-in user — an invitee has no tenant context yet", async () => {
    h.memberships.acceptInvitation.mockResolvedValue({ tenant: { slug: "acme" } });

    await controller.accept({ tenant: "acme" }, user, recordingResponse());

    expect(h.memberships.acceptInvitation).toHaveBeenCalledWith(user, { tenant: "acme" });
  });

  it("remembers the accepted workspace, so a second membership is not ambiguous", async () => {
    h.memberships.acceptInvitation.mockResolvedValue({
      tenant: { tenantId: "t2", slug: "acme", name: "Acme Health", status: "active" },
    });
    const response = recordingResponse();

    await controller.accept({ tenant: "acme" }, user, response);

    expect(response.calls).toHaveLength(1);
    expect(response.calls[0]?.name).toBe("dw_tenant");
    expect(response.calls[0]?.value).toBe("acme");
  });

  it("sets NO cookie when the invitation is refused", async () => {
    h.memberships.acceptInvitation.mockRejectedValue(
      new AppError("CONFLICT", "That invitation is no longer open"),
    );
    const response = recordingResponse();

    await expect(controller.accept({ tenant: "acme" }, user, response)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(response.calls).toHaveLength(0);
  });
});
