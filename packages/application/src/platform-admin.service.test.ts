import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * `platformAdminService` — the audited crossing, and the two writes that act on a tenant from
 * outside it (6.8).
 *
 * The real `requirePlatformCapability` runs here, driven by the environment, because the point of
 * these cases is that authorization on this axis comes from configuration and not from anything a
 * tenant can express. Only the repositories and the audit writer are mocked, so what is asserted
 * is: an Owner gets nothing, an admin's cross-tenant action writes exactly one row INTO THE TENANT
 * IT TOUCHED in the same transaction as the change itself, and that row carries ids and closed
 * vocabulary only.
 */

const h = vi.hoisted(() => ({
  listAll: vi.fn(),
  findBySlug: vi.fn(),
  countActiveByTenantIds: vi.fn(),
  writeAudit: vi.fn(),
  setStatus: vi.fn(),
  lastActivityAt: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  membershipRepository: { countActiveByTenantIds: h.countActiveByTenantIds },
  tenantRepository: { listAll: h.listAll, findBySlug: h.findBySlug },
}));
vi.mock("@destaworks/db/tenancy/platform-tenant.repository", () => ({
  platformTenantRepository: { setStatus: h.setStatus, lastActivityAt: h.lastActivityAt },
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
const announced: string[] = vi.hoisted(() => []);

vi.mock("@destaworks/db/tenant-transaction", () => ({
  // Records the tenant the transaction ANNOUNCES, which is the whole point of these flows: they
  // write into a tenant they can name but hold no context for.
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

/** A fixed clock, so "7 days from now" is a fact rather than a race against the suite. */
const NOW = new Date("2026-06-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

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

interface TenantOverrides {
  status?: string;
  plan?: string;
  seatLimit?: number | null;
  trialEndsAt?: Date | null;
}

function tenant(overrides: TenantOverrides = {}) {
  return {
    id: "t1",
    slug: "acme",
    name: "Acme Health",
    status: overrides.status ?? "active",
    plan: overrides.plan ?? "growth",
    seatLimit: overrides.seatLimit === undefined ? 10 : overrides.seatLimit,
    trialEndsAt: overrides.trialEndsAt === undefined ? null : overrides.trialEndsAt,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
  };
}

const acme = tenant();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  announced.length = 0;
  process.env["PLATFORM_ADMIN_USER_IDS"] = "u-platform";
  h.listAll.mockResolvedValue([acme]);
  h.findBySlug.mockResolvedValue(acme);
  h.countActiveByTenantIds.mockResolvedValue(new Map([["t1", 4]]));
  h.writeAudit.mockResolvedValue(undefined);
  h.lastActivityAt.mockResolvedValue(null);
  h.setStatus.mockImplementation((_tx: unknown, _id: string, status: string) =>
    Promise.resolve(tenant({ status })),
  );
});

afterEach(() => {
  vi.useRealTimers();
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

  it("is refused when suspending a tenant, and nothing is written", async () => {
    await expect(
      platformAdminService.suspendTenant(tenantOwner, "acme", { reason: "abuse" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("is refused when restoring a tenant, and nothing is written", async () => {
    await expect(platformAdminService.restoreTenant(tenantOwner, "acme")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.setStatus).not.toHaveBeenCalled();
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

  it("audits BEFORE it reads inside the tenant, so a failed audit reads nothing", async () => {
    h.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(platformAdminService.readTenant(admin, "acme")).rejects.toThrow();
    expect(h.lastActivityAt).not.toHaveBeenCalled();
  });
});

describe("the tenant registry", () => {
  it("returns operational metadata and health, never a tenant's contents", async () => {
    const result = await platformAdminService.listTenants(admin);

    expect(result.tenants).toEqual([
      {
        id: "t1",
        slug: "acme",
        name: "Acme Health",
        status: "active",
        plan: "growth",
        memberCount: 4,
        createdAt: "2026-01-01T00:00:00.000Z",
        health: {
          level: "ok",
          signals: [],
          seats: { used: 4, limit: 10, overLimit: false },
          trial: null,
        },
      },
    ]);
  });

  it("is not audited into a tenant, because it reaches into none", async () => {
    await platformAdminService.listTenants(admin);

    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("costs two queries however many tenants there are — no count per tenant", async () => {
    h.listAll.mockResolvedValue([
      tenant(),
      { ...tenant(), id: "t2", slug: "beta" },
      { ...tenant(), id: "t3", slug: "gamma" },
    ]);
    h.countActiveByTenantIds.mockResolvedValue(new Map([["t1", 1]]));

    await platformAdminService.listTenants(admin);

    expect(h.countActiveByTenantIds).toHaveBeenCalledTimes(1);
    expect(h.countActiveByTenantIds).toHaveBeenCalledWith(["t1", "t2", "t3"]);
  });

  it("defaults a tenant with no active members to zero rather than omitting it", async () => {
    h.countActiveByTenantIds.mockResolvedValue(new Map());

    const result = await platformAdminService.listTenants(admin);

    expect(result.tenants[0]?.memberCount).toBe(0);
  });
});

describe("tenant health", () => {
  async function healthOf(overrides: TenantOverrides, memberCount = 4) {
    h.listAll.mockResolvedValue([tenant(overrides)]);
    h.countActiveByTenantIds.mockResolvedValue(new Map([["t1", memberCount]]));
    const result = await platformAdminService.listTenants(admin);
    return result.tenants[0]?.health;
  }

  it("is ok for a live tenant inside its seat limit with no trial", async () => {
    await expect(healthOf({})).resolves.toMatchObject({ level: "ok", signals: [] });
  });

  it("is critical when the tenant is suspended", async () => {
    const health = await healthOf({ status: "suspended" });

    expect(health?.level).toBe("critical");
    expect(health?.signals).toContain("suspended");
  });

  it("is critical when nobody can sign in, which the registry alone would call healthy", async () => {
    const health = await healthOf({}, 0);

    expect(health?.level).toBe("critical");
    expect(health?.signals).toContain("no-active-members");
  });

  it("is critical when the trial has run out, and reports zero days rather than a negative", async () => {
    const health = await healthOf({ trialEndsAt: daysFromNow(-4) });

    expect(health?.level).toBe("critical");
    expect(health?.signals).toContain("trial-expired");
    expect(health?.trial).toEqual({
      endsAt: daysFromNow(-4).toISOString(),
      daysRemaining: 0,
      expired: true,
    });
  });

  it("warns a week before a trial ends, and not two", async () => {
    await expect(healthOf({ trialEndsAt: daysFromNow(5) })).resolves.toMatchObject({
      level: "warning",
      signals: ["trial-ending-soon"],
    });
    await expect(healthOf({ trialEndsAt: daysFromNow(14) })).resolves.toMatchObject({
      level: "ok",
      signals: [],
    });
  });

  it("warns at the seat limit and again over it, and never for an uncapped plan", async () => {
    await expect(healthOf({ seatLimit: 4 }, 4)).resolves.toMatchObject({
      level: "warning",
      signals: ["at-seat-limit"],
      seats: { used: 4, limit: 4, overLimit: false },
    });
    await expect(healthOf({ seatLimit: 3 }, 4)).resolves.toMatchObject({
      level: "warning",
      signals: ["over-seat-limit"],
      seats: { used: 4, limit: 3, overLimit: true },
    });
    // `null` is "no limit", not "a limit of zero" — the difference is a whole plan tier.
    await expect(healthOf({ seatLimit: null }, 400)).resolves.toMatchObject({
      level: "ok",
      seats: { used: 400, limit: null, overLimit: false },
    });
  });

  it("orders signals most severe first, so a console can render the headline one", async () => {
    const health = await healthOf({ status: "suspended", seatLimit: 1 }, 4);

    expect(health?.signals).toEqual(["suspended", "over-seat-limit"]);
    expect(health?.level).toBe("critical");
  });
});

describe("reading one tenant", () => {
  it("adds last activity, read inside the transaction the audit already opened", async () => {
    h.lastActivityAt.mockResolvedValue(new Date("2026-05-30T09:00:00.000Z"));

    const result = await platformAdminService.readTenant(admin, "acme");

    expect(result.tenant.lastActivityAt).toBe("2026-05-30T09:00:00.000Z");
    expect(h.lastActivityAt).toHaveBeenCalledWith({ tx: true }, "t1");
    expect(announced).toEqual(["t1"]);
  });

  it("reports a tenant nobody has ever used as null rather than inventing a date", async () => {
    h.lastActivityAt.mockResolvedValue(null);

    const result = await platformAdminService.readTenant(admin, "acme");

    expect(result.tenant.lastActivityAt).toBeNull();
  });
});

describe("suspending a tenant", () => {
  it("writes the status change and its audit row in ONE announced transaction", async () => {
    await platformAdminService.suspendTenant(admin, "acme", { reason: "nonpayment" });

    expect(announced).toEqual(["t1"]);
    // Same `tx` object for both: the suspension cannot commit without the record of it.
    expect(h.setStatus).toHaveBeenCalledWith({ tx: true }, "t1", "suspended");
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        entity: "tenant",
        entityId: "t1",
        tenantId: "t1",
        actor: "u-platform",
        action: "platform_tenant_suspended",
        after: { tenantId: "t1", from: "active", to: "suspended", reason: "nonpayment" },
      }),
    );
  });

  it("records the reason as a code, never free text that could carry someone's PII", async () => {
    await platformAdminService.suspendTenant(admin, "acme", { reason: "customer-request" });

    const written = JSON.stringify(h.writeAudit.mock.calls[0]?.[1]);
    expect(written).toContain("customer-request");
    expect(written).not.toContain("ops@destaworks.com");
  });

  it("returns the tenant as suspended, with health that says so", async () => {
    const result = await platformAdminService.suspendTenant(admin, "acme", { reason: "abuse" });

    expect(result.tenant.status).toBe("suspended");
    expect(result.tenant.health.level).toBe("critical");
    expect(result.tenant.health.signals).toContain("suspended");
  });

  it("is a no-op on an already-suspended tenant — nothing changed, so nothing is audited", async () => {
    h.findBySlug.mockResolvedValue(tenant({ status: "suspended" }));

    const result = await platformAdminService.suspendTenant(admin, "acme", { reason: "abuse" });

    expect(result.tenant.status).toBe("suspended");
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a tenant that does not exist, and writes nothing", async () => {
    h.findBySlug.mockResolvedValue(null);

    await expect(
      platformAdminService.suspendTenant(admin, "ghost", { reason: "abuse" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.setStatus).not.toHaveBeenCalled();
  });

  it("fails the suspension when the audit write fails", async () => {
    h.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      platformAdminService.suspendTenant(admin, "acme", { reason: "abuse" }),
    ).rejects.toThrow("audit unavailable");
  });
});

describe("restoring a tenant", () => {
  beforeEach(() => {
    h.findBySlug.mockResolvedValue(tenant({ status: "suspended" }));
  });

  it("returns a tenant with no live trial to `active`", async () => {
    const result = await platformAdminService.restoreTenant(admin, "acme");

    expect(h.setStatus).toHaveBeenCalledWith({ tx: true }, "t1", "active");
    expect(result.tenant.status).toBe("active");
  });

  it("returns a tenant whose trial is still running to `trial`, not `active`", async () => {
    // Defaulting to `active` would silently promote a suspended trial into a paying-looking
    // workspace — a billing fact invented by a support action.
    h.findBySlug.mockResolvedValue(tenant({ status: "suspended", trialEndsAt: daysFromNow(20) }));

    await platformAdminService.restoreTenant(admin, "acme");

    expect(h.setStatus).toHaveBeenCalledWith({ tx: true }, "t1", "trial");
  });

  it("treats an elapsed trial as no trial and restores to `active`", async () => {
    h.findBySlug.mockResolvedValue(tenant({ status: "suspended", trialEndsAt: daysFromNow(-1) }));

    await platformAdminService.restoreTenant(admin, "acme");

    expect(h.setStatus).toHaveBeenCalledWith({ tx: true }, "t1", "active");
  });

  it("audits the restore into the tenant, in the same announced transaction", async () => {
    await platformAdminService.restoreTenant(admin, "acme");

    expect(announced).toEqual(["t1"]);
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        tenantId: "t1",
        actor: "u-platform",
        action: "platform_tenant_restored",
        after: { tenantId: "t1", from: "suspended", to: "active" },
      }),
    );
  });

  it("is a no-op on a tenant that is not suspended", async () => {
    h.findBySlug.mockResolvedValue(tenant({ status: "active" }));

    const result = await platformAdminService.restoreTenant(admin, "acme");

    expect(result.tenant.status).toBe("active");
    expect(h.setStatus).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});
