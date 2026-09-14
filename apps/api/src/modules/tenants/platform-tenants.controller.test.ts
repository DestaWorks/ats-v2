import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PlatformTenantsController` — the platform plane's transport (6.8).
 *
 * The service is mocked because its authorization and its audit have their own suite. What is
 * asserted here is the transport's contribution and its limits: it forwards the slug from the PATH
 * and the body the contract schema validated, it declares a response type per route, and it does
 * NOT decide anything — there is no guard here that could accidentally become the authorization,
 * and no branch that could return early without the service having audited.
 */

const h = vi.hoisted(() => ({
  platform: {
    listTenants: vi.fn(),
    readTenant: vi.fn(),
    suspendTenant: vi.fn(),
    restoreTenant: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/platform-admin.service", () => ({
  platformAdminService: h.platform,
}));

import { platformAdminService } from "@destaworks/application/platform-admin.service";
import {
  suspendTenantSchema,
  TENANT_SUSPENSION_REASONS,
} from "@destaworks/contracts/validation/tenant";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "@destaworks/auth/guards";
import { PlatformTenantsController } from "./platform-tenants.controller";

const user: AuthUser = { id: "u-platform", email: "ops@destaworks.com", name: "Ops" };

const controller = new PlatformTenantsController(platformAdminService);

beforeEach(() => {
  vi.clearAllMocks();
  h.platform.listTenants.mockResolvedValue({ tenants: [] });
  h.platform.readTenant.mockResolvedValue({ tenant: { id: "t1" } });
  h.platform.suspendTenant.mockResolvedValue({ tenant: { id: "t1", status: "suspended" } });
  h.platform.restoreTenant.mockResolvedValue({ tenant: { id: "t1", status: "active" } });
});

describe("the read routes forward the signed-in user and the path slug", () => {
  it("GET /platform/tenants passes the user through untouched", async () => {
    await expect(controller.list(user)).resolves.toEqual({ tenants: [] });
    expect(h.platform.listTenants).toHaveBeenCalledWith(user);
  });

  it("GET /platform/tenants/:slug names the tenant from the PATH, never from a body", async () => {
    await controller.read("acme", user);

    expect(h.platform.readTenant).toHaveBeenCalledWith(user, "acme");
  });
});

describe("the suspension routes", () => {
  it("POST :slug/suspend forwards the validated reason", async () => {
    const result = await controller.suspend("acme", { reason: "nonpayment" }, user);

    expect(h.platform.suspendTenant).toHaveBeenCalledWith(user, "acme", { reason: "nonpayment" });
    expect(result).toEqual({ tenant: { id: "t1", status: "suspended" } });
  });

  it("POST :slug/restore takes no body — the status to return to is the service's to derive", async () => {
    const result = await controller.restore("acme", user);

    expect(h.platform.restoreTenant).toHaveBeenCalledWith(user, "acme");
    expect(result).toEqual({ tenant: { id: "t1", status: "active" } });
  });

  it("lets a refusal from the service propagate rather than answering for it", async () => {
    h.platform.suspendTenant.mockRejectedValue(new AppError("FORBIDDEN", "nope"));

    await expect(controller.suspend("acme", { reason: "abuse" }, user)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("the suspension reason is a closed vocabulary", () => {
  it("accepts every declared reason", () => {
    for (const reason of TENANT_SUSPENSION_REASONS) {
      expect(suspendTenantSchema.safeParse({ reason }).success).toBe(true);
    }
  });

  it("rejects free text, which is how a customer's PII would reach their own audit trail", () => {
    const parsed = suspendTenantSchema.safeParse({
      reason: "spoke to Dr Abebe on +251911234567",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a missing reason and any unknown key", () => {
    expect(suspendTenantSchema.safeParse({}).success).toBe(false);
    expect(suspendTenantSchema.safeParse({ reason: "abuse", status: "active" }).success).toBe(
      false,
    );
  });
});
