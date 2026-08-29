import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

/**
 * `platformImpersonationService` — consented, time-boxed, audited (Phase 8).
 *
 * The real `requirePlatformCapability` and the real gate run here, driven by the environment and by
 * a pinned clock, because the point of these cases is that authorization comes from configuration
 * and from a server-side instant, never from anything the caller sends. Only the repositories and
 * the audit writer are mocked.
 */

const h = vi.hoisted(() => ({
  findBySlug: vi.fn(),
  latestEvent: vi.fn(),
  auditList: vi.fn(),
  writeAudit: vi.fn(),
}));

const announced: string[] = vi.hoisted(() => []);
const scopedTenants: string[] = vi.hoisted(() => []);

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  tenantRepository: { findBySlug: h.findBySlug },
  membershipRepository: {},
}));
vi.mock("@destaworks/db/tenancy/support-window.repository", () => ({
  supportWindowRepository: { latestEvent: h.latestEvent },
  SUPPORT_WINDOW_ENTITY: "support_window",
  SUPPORT_WINDOW_ACTION: "platform_access",
  IMPERSONATION_ENTITY: "tenant",
}));
vi.mock("@destaworks/db/repositories/audit.repository", () => ({
  auditRepository: { list: h.auditList },
}));
vi.mock("@destaworks/db/tenant-transaction", () => ({
  withAnnouncedTenant: (tenantId: string, fn: (tx: unknown) => unknown) => {
    announced.push(tenantId);
    return fn({ tx: true });
  },
}));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTenantTransaction: (ctx: { tenantId: string }, fn: (tx: unknown) => unknown) => {
    scopedTenants.push(ctx.tenantId);
    return fn({ tx: true });
  },
}));

import { fixedClock } from "@destaworks/domain/clock";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import { platformImpersonationService } from "./platform-impersonation.service";

const ORIGINAL = process.env["PLATFORM_ADMIN_USER_IDS"];

const NOW = new Date("2026-08-29T12:00:00.000Z");
const clock = fixedClock(NOW);

const admin: AuthUser = { id: "u-platform", email: "ops@destaworks.com", name: "Ops" };
const tenantOwnerUser: AuthUser = {
  id: "u-owner",
  email: "owner@acme.example",
  name: "Acme Owner",
};

const acme = { id: "t1", slug: "acme", name: "Acme Health", status: "active", deletedAt: null };

function ctxWith(role: TenantContext["role"]): TenantContext {
  return {
    tenantId: "t1",
    membershipId: "m1",
    role,
    user: { id: "u-owner", email: "owner@acme.example", name: "Acme Owner" },
  };
}

/** A ledger row as the repository returns it. */
function grantRow(minutesFromNow: number, reason = "bug-report") {
  return {
    id: "log1",
    at: NOW,
    actor: "u-owner",
    after: {
      scope: "grant",
      expiresAt: new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString(),
      reason,
    },
  };
}

const revokeRow = { id: "log2", at: NOW, actor: "u-owner", after: { scope: "revoke" } };

beforeEach(() => {
  vi.clearAllMocks();
  announced.length = 0;
  scopedTenants.length = 0;
  process.env["PLATFORM_ADMIN_USER_IDS"] = "u-platform";
  h.findBySlug.mockResolvedValue(acme);
  h.latestEvent.mockResolvedValue(null);
  h.auditList.mockResolvedValue([]);
  h.writeAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["PLATFORM_ADMIN_USER_IDS"];
  else process.env["PLATFORM_ADMIN_USER_IDS"] = ORIGINAL;
});

describe("consent is the tenant's to give", () => {
  it("refuses a member without `manageUsers`, and writes nothing", async () => {
    await expect(
      platformImpersonationService.grantSupportWindow(
        ctxWith("Associate"),
        { minutes: 30, reason: "bug-report" },
        clock,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a member without `manageUsers` when withdrawing too", async () => {
    await expect(
      platformImpersonationService.revokeSupportWindow(ctxWith("Screener"), clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("records a grant in the tenant's own ledger, ids only", async () => {
    await platformImpersonationService.grantSupportWindow(
      ctxWith("Owner"),
      { minutes: 30, reason: "billing" },
      clock,
    );

    expect(scopedTenants).toEqual(["t1"]);
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        entity: "support_window",
        entityId: "t1",
        action: "platform_access",
        actor: "u-owner",
        tenantId: "t1",
      }),
    );

    const written = JSON.stringify(h.writeAudit.mock.calls[0]?.[1]);
    expect(written).not.toContain("owner@acme.example");
    expect(written).not.toContain("Acme Owner");
  });

  it("caps the window server-side, however long the caller asked for", async () => {
    const result = await platformImpersonationService.grantSupportWindow(
      ctxWith("Owner"),
      { minutes: 6000, reason: "other" },
      clock,
    );

    // 60 minutes is the ceiling in the contract; the caller asked for 100 hours.
    expect(result.window.expiresAt).toBe(new Date(NOW.getTime() + 60 * 60_000).toISOString());
  });

  it("supersedes rather than deletes when consent is withdrawn", async () => {
    await platformImpersonationService.revokeSupportWindow(ctxWith("Admin"), clock);

    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        entity: "support_window",
        after: expect.objectContaining({ scope: "revoke" }),
      }),
    );
  });

  it("lets any member see whether the workspace is currently exposed", async () => {
    h.latestEvent.mockResolvedValue(grantRow(30, "data-issue"));

    const result = await platformImpersonationService.getSupportWindow(ctxWith("Associate"), clock);

    expect(result.window).toMatchObject({ tenantId: "t1", open: true, reason: "data-issue" });
  });

  it("reports a lapsed window as closed without anyone having to close it", async () => {
    h.latestEvent.mockResolvedValue(grantRow(30));
    const later = fixedClock(new Date(NOW.getTime() + 31 * 60_000));

    const result = await platformImpersonationService.getSupportWindow(ctxWith("Owner"), later);

    expect(result.window.open).toBe(false);
    expect(result.window.grantedAt).not.toBeNull();
  });
});

describe("granting consent is not an escalation path", () => {
  it("gives the granting Owner no platform reach of their own", async () => {
    await platformImpersonationService.grantSupportWindow(
      ctxWith("Owner"),
      { minutes: 60, reason: "other" },
      clock,
    );
    h.latestEvent.mockResolvedValue(grantRow(60));

    await expect(
      platformImpersonationService.readActivityAsTenant(tenantOwnerUser, "acme", null, clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(h.auditList).not.toHaveBeenCalled();
  });

  it("returns nothing resembling a platform capability from a grant", async () => {
    const result = await platformImpersonationService.grantSupportWindow(
      ctxWith("Owner"),
      { minutes: 60, reason: "other" },
      clock,
    );

    expect(JSON.stringify(result)).not.toContain("readTenantData");
    expect(Object.keys(result.window)).toEqual([
      "tenantId",
      "open",
      "reason",
      "grantedAt",
      "expiresAt",
    ]);
  });
});

describe("the crossing refuses without live consent", () => {
  it("refuses when the tenant never consented", async () => {
    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(h.auditList).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("refuses after consent is withdrawn", async () => {
    h.latestEvent.mockResolvedValue(revokeRow);

    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(h.auditList).not.toHaveBeenCalled();
  });

  it("refuses once the window has expired, without any client involvement", async () => {
    h.latestEvent.mockResolvedValue(grantRow(15));
    const later = fixedClock(new Date(NOW.getTime() + 16 * 60_000));

    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "acme", null, later),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(h.auditList).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("treats an unreadable ledger payload as no consent at all", async () => {
    h.latestEvent.mockResolvedValue({ id: "x", at: NOW, actor: "u", after: { scope: "grant" } });

    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not reveal whether a workspace exists before checking the plane", async () => {
    h.findBySlug.mockResolvedValue(null);

    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "nosuchtenant", null, clock),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("the crossing is audited into the tenant it touched", () => {
  beforeEach(() => {
    h.latestEvent.mockResolvedValue(grantRow(30));
  });

  it("announces that tenant, and writes exactly one row, before reading anything", async () => {
    await platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock);

    expect(announced).toEqual(["t1"]);
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

  it("marks the row as impersonation, not as ordinary platform metadata access", async () => {
    await platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock);

    expect(h.writeAudit.mock.calls[0]?.[1]).toMatchObject({
      after: expect.objectContaining({ scope: "impersonated-read", view: "activity" }),
    });
  });

  it("records ids only — never the acting admin's email or name", async () => {
    await platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock);

    const written = JSON.stringify(h.writeAudit.mock.calls[0]?.[1]);
    expect(written).not.toContain("ops@destaworks.com");
    expect(written).not.toContain("Ops");
    expect(written).toContain("t1");
  });

  it("fails the read when the audit write fails — an unaudited crossing is not a success", async () => {
    h.writeAudit.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock),
    ).rejects.toThrow("audit unavailable");
    expect(h.auditList).not.toHaveBeenCalled();
  });
});

describe("what the crossing returns", () => {
  beforeEach(() => {
    h.latestEvent.mockResolvedValue(grantRow(30));
  });

  it("declares itself impersonated on the wire", async () => {
    const result = await platformImpersonationService.readActivityAsTenant(
      admin,
      "acme",
      null,
      clock,
    );

    expect(result.impersonation).toEqual({
      impersonated: true,
      tenantId: "t1",
      platformUserId: "u-platform",
      expiresAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    });
  });

  it("scopes the trail read to the impersonated tenant", async () => {
    await platformImpersonationService.readActivityAsTenant(admin, "acme", null, clock);

    expect(h.auditList).toHaveBeenCalledTimes(1);
    expect(h.auditList.mock.calls[0]?.[0]).toMatchObject({ tenantId: "t1" });
  });

  it("never ships the before/after snapshots, which is where the PII lives", async () => {
    h.auditList.mockResolvedValue([
      {
        id: "a1",
        at: NOW,
        actor: "u9",
        action: "update",
        entity: "candidate",
        entityId: "c1",
        before: { name: "A. Bekele", email: "a.bekele@example.com" },
        after: { name: "A. Bekele", licenseNumber: "TX-12345" },
      },
    ]);

    const result = await platformImpersonationService.readActivityAsTenant(
      admin,
      "acme",
      null,
      clock,
    );

    expect(Object.keys(result.items[0] ?? {})).toEqual([
      "id",
      "at",
      "actor",
      "action",
      "entity",
      "entityId",
    ]);
    expect(JSON.stringify(result.items)).not.toContain("Bekele");
    expect(JSON.stringify(result.items)).not.toContain("TX-12345");
  });

  it("rejects a malformed page cursor rather than silently ignoring it", async () => {
    await expect(
      platformImpersonationService.readActivityAsTenant(admin, "acme", "not-a-cursor", clock),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("impersonation is read-only", () => {
  it("exposes no method that could mutate a tenant's data", () => {
    expect(Object.keys(platformImpersonationService).sort()).toEqual([
      "getSupportWindow",
      "grantSupportWindow",
      "readActivityAsTenant",
      "revokeSupportWindow",
    ]);
  });
});
