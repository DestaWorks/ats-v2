import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * `platformAdminService` — the audited crossing (6.8).
 *
 * The real `requirePlatformCapability` runs here, driven by the environment, because the point of
 * these cases is that authorization on this axis comes from configuration and not from anything a
 * tenant can express. Only the repositories and the audit writer are mocked, so what is asserted
 * is: an Owner gets nothing, an admin's cross-tenant read writes exactly one row INTO THE TENANT
 * IT TOUCHED, and that row carries ids only.
 */

const h = vi.hoisted(() => ({
  listAll: vi.fn(),
  findBySlug: vi.fn(),
  countActiveByTenantIds: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  membershipRepository: { countActiveByTenantIds: h.countActiveByTenantIds },
  tenantRepository: { listAll: h.listAll, findBySlug: h.findBySlug },
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
const announced: string[] = vi.hoisted(() => []);

vi.mock("@destaworks/db/tenant-transaction", () => ({
  // Records the tenant the transaction ANNOUNCES, which is the whole point of these two flows:
  // they write into a tenant they can name but hold no context for.
  withAnnouncedTenant: (tenantId: string, fn: (tx: unknown) => unknown) => {
    announced.push(tenantId);
    return fn({ tx: true });
  },
}));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn({ tx: true }),
}));

import { platformAdminService } from "./platform-admin.service";
import type { AuthUser } from "@destaworks/auth/guards";

const ORIGINAL = process.env["PLATFORM_ADMIN_USER_IDS"];

const admin: AuthUser = {
  id: "u-platform",
  email: "ops@destaworks.com",
  name: "Ops",
};

/** The most privileged identity a TENANT can produce. It must get nothing here. */
const tenantOwner: AuthUser = {
  id: "u-owner",
  email: "owner@acme.example",
  name: "Acme Owner",
};

const acme = {
  id: "t1",
  slug: "acme",
  name: "Acme Health",
  status: "active",
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env["PLATFORM_ADMIN_USER_IDS"] = "u-platform";
  h.listAll.mockResolvedValue([acme]);
  h.findBySlug.mockResolvedValue(acme);
  h.countActiveByTenantIds.mockResolvedValue(new Map([["t1", 4]]));
  h.writeAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["PLATFORM_ADMIN_USER_IDS"];
  else process.env["PLATFORM_ADMIN_USER_IDS"] = ORIGINAL;
});

describe("a tenant Owner cannot reach the platform plane", () => {
  it("is refused when reading another tenant, and nothing is read or written", async () => {
    await expect(platformAdminService.readTenant(tenantOwner, "acme")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(h.findBySlug).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("is refused when listing the tenant registry", async () => {
    await expect(platformAdminService.listTenants(tenantOwner)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.listAll).not.toHaveBeenCalled();
  });

  it("is still refused when the plane is unconfigured entirely", async () => {
    delete process.env["PLATFORM_ADMIN_USER_IDS"];

    await expect(platformAdminService.readTenant(tenantOwner, "acme")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("a platform admin's cross-tenant action is audited", () => {
  it("announces the tenant it TOUCHES, not the admin's — there is no admin tenant", async () => {
    announced.length = 0;
    await platformAdminService.readTenant(admin, "acme");

    // The audit row lands in that tenant's own `activity_log`, which is tenant-scoped with a
    // WITH CHECK policy. Unannounced the insert is refused, and since the audit gates the read,
    // the whole platform plane stops working the day RLS is applied.
    expect(announced).toEqual(["t1"]);
  });

  it("writes exactly one audit row, into the tenant it touched", async () => {
    await platformAdminService.readTenant(admin, "acme");

    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        entity: "tenant",
        entityId: "t1",
        action: "platform_access",
        actor: "u-platform",
        tenantId: "t1",
      }),
    );
  });

  it("records ids only — never the acting admin's email or any other PII", async () => {
    await platformAdminService.readTenant(admin, "acme");

    const written = JSON.stringify(h.writeAudit.mock.calls[0]?.[1]);
    expect(written).not.toContain("ops@destaworks.com");
    expect(written).not.toContain("Ops");
    expect(written).toContain("t1");
  });

  it("does not audit a read of a tenant that does not exist", async () => {
    h.findBySlug.mockResolvedValue(null);

    await expect(platformAdminService.readTenant(admin, "nosuchtenant")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("fails the read when the audit write fails — an unaudited crossing is not a success", async () => {
    h.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(platformAdminService.readTenant(admin, "acme")).rejects.toThrow(
      "audit unavailable",
    );
  });
});

describe("the tenant registry", () => {
  it("returns operational metadata only, with an active member count", async () => {
    await expect(platformAdminService.listTenants(admin)).resolves.toEqual({
      tenants: [{ id: "t1", slug: "acme", name: "Acme Health", status: "active", memberCount: 4 }],
    });
  });

  it("is not audited into a tenant, because it reaches into none", async () => {
    await platformAdminService.listTenants(admin);

    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("defaults a tenant with no active members to zero rather than omitting it", async () => {
    h.countActiveByTenantIds.mockResolvedValue(new Map());

    const result = await platformAdminService.listTenants(admin);

    expect(result.tenants[0]?.memberCount).toBe(0);
  });
});
