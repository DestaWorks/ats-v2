import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `membershipService` — the invitation lifecycle and the tenant switch.
 *
 * The repository and the resolution path are mocked; what is asserted is the service's own
 * contribution: that switching is decided by the server, that a capability (never a role name)
 * gates member management, that every lifecycle change writes an audit row, and that a workspace
 * cannot be left with nobody who can administer it.
 */

const h = vi.hoisted(() => ({
  findByUserAndSlug: vi.fn(),
  findByTenantAndUser: vi.fn(),
  findByIdInTenant: vi.fn(),
  listByTenant: vi.fn(),
  countActiveByRole: vi.fn(),
  upsertInvitation: vi.fn(),
  updateStatus: vi.fn(),
  namesByIds: vi.fn(),
  emailsByIds: vi.fn(),
  findByEmail: vi.fn(),
  findActorById: vi.fn(),
  writeAudit: vi.fn(),
  resolveTenantContext: vi.fn(),
  listTenantChoices: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  membershipRepository: {
    findByUserAndSlug: h.findByUserAndSlug,
    findByTenantAndUser: h.findByTenantAndUser,
    findByIdInTenant: h.findByIdInTenant,
    listByTenant: h.listByTenant,
    countActiveByRole: h.countActiveByRole,
    upsertInvitation: h.upsertInvitation,
    updateStatus: h.updateStatus,
  },
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({
  userRepository: {
    namesByIds: h.namesByIds,
    emailsByIds: h.emailsByIds,
    findByEmail: h.findByEmail,
    findActorById: h.findActorById,
  },
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
const announced: string[] = vi.hoisted(() => []);

vi.mock("@destaworks/db/tenant-transaction", () => ({
  // Records the tenant the transaction ANNOUNCES — the point of this flow is that it writes into a
  // tenant it can name but holds no context for.
  withAnnouncedTenant: (tenantId: string, fn: (tx: unknown) => unknown) => {
    announced.push(tenantId);
    return fn({ tx: true });
  },
}));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn({ tx: true }),
  withTenantTransaction: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ tx: true }),
}));
vi.mock("@destaworks/auth/tenant-context", () => ({
  resolveTenantContext: h.resolveTenantContext,
  listTenantChoices: h.listTenantChoices,
}));

import { membershipService } from "./membership.service";
import type { TenantContext } from "@destaworks/domain/tenant";
import type { AuthUser } from "@destaworks/auth/guards";
import type { Role } from "@destaworks/domain/constants";

const user: AuthUser = { id: "u1", email: "jane@desta.works", name: "Jane Doe" };

function contextWith(role: Role): TenantContext {
  return {
    tenantId: "t1",
    membershipId: "m1",
    user: { id: "u1", email: "jane@desta.works", name: "Jane Doe" },
    role,
  };
}

function membership(overrides: { id?: string; role?: string; status?: string; userId?: string }) {
  return {
    id: overrides.id ?? "m2",
    tenantId: "t1",
    userId: overrides.userId ?? "u2",
    role: overrides.role ?? "Associate",
    status: overrides.status ?? "active",
    invitedById: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    tenant: {
      id: "t1",
      slug: "acme",
      name: "Acme Health",
      status: "active",
      deletedAt: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.namesByIds.mockResolvedValue(new Map([["u2", "John Roe"]]));
  h.emailsByIds.mockResolvedValue(new Map([["u2", "john@desta.works"]]));
  h.writeAudit.mockResolvedValue(undefined);
});

describe("switchTenant is server-authoritative", () => {
  it("refuses a workspace the caller has no active membership in, and returns no slug to set", async () => {
    h.resolveTenantContext.mockResolvedValue({
      outcome: "denied",
      claim: { source: "body", slug: "northwind" },
      reason: "no-membership",
    });

    await expect(
      membershipService.switchTenant(user, { tenant: "northwind" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("refuses an INVITED membership — a switch cannot skip the acceptance", async () => {
    h.resolveTenantContext.mockResolvedValue({
      outcome: "denied",
      claim: { source: "body", slug: "acme" },
      reason: "invited",
    });

    await expect(membershipService.switchTenant(user, { tenant: "acme" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("answers with the slug the SERVER resolved, so the cookie can never hold an unverified one", async () => {
    h.resolveTenantContext.mockResolvedValue({
      outcome: "resolved",
      context: contextWith("Owner"),
      tenant: {
        tenantId: "t1",
        slug: "acme",
        name: "Acme Health",
        role: "Owner",
        status: "active",
      },
    });

    const result = await membershipService.switchTenant(user, { tenant: "acme" });

    expect(result.tenant).toEqual({
      tenantId: "t1",
      slug: "acme",
      name: "Acme Health",
      role: "Owner",
      status: "active",
    });
    expect(h.resolveTenantContext).toHaveBeenCalledWith(user, { source: "body", slug: "acme" });
  });
});

describe("member management is gated on a capability, not a role name", () => {
  const withoutManageUsers: readonly Role[] = ["Director", "Manager", "Screener", "Associate"];

  it("refuses every role that does not hold manageUsers", async () => {
    for (const role of withoutManageUsers) {
      await expect(
        membershipService.invite(contextWith(role), {
          email: "john@desta.works",
          role: "Associate",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(membershipService.listMembers(contextWith(role))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(membershipService.remove(contextWith(role), "m2")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    expect(h.upsertInvitation).not.toHaveBeenCalled();
    expect(h.updateStatus).not.toHaveBeenCalled();
  });

  it("uses the MEMBERSHIP role, so an Associate account that is Owner here may manage members", async () => {
    h.listByTenant.mockResolvedValue([membership({})]);

    await expect(membershipService.listMembers(contextWith("Owner"))).resolves.toMatchObject({
      members: [{ membershipId: "m2", name: "John Roe" }],
    });
    // The stale identity role is not merely unused now — it cannot be expressed:
    // `role` is gone from `AuthUser`, so reading one off the user is a compile error.
    expect("role" in user).toBe(false);
  });
});

describe("invite", () => {
  it("creates an INVITED membership, which grants nothing until accepted, and audits it", async () => {
    h.findByEmail.mockResolvedValue({ id: "u2" });
    h.findActorById.mockResolvedValue({
      id: "u2",
      email: "john@desta.works",
      name: "John Roe",
    });
    h.findByTenantAndUser.mockResolvedValue(null);
    h.upsertInvitation.mockResolvedValue(membership({ status: "invited", role: "Screener" }));

    const result = await membershipService.invite(contextWith("Admin"), {
      email: "john@desta.works",
      role: "Screener",
    });

    expect(h.upsertInvitation).toHaveBeenCalledWith(
      { tenantId: "t1", userId: "u2", role: "Screener", invitedById: "u1" },
      { tx: true },
    );
    expect(result.member.status).toBe("invited");
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({
        entity: "membership",
        action: "invite",
        actor: "u1",
        tenantId: "t1",
      }),
    );
  });

  it("refuses to invent an account — account creation keeps its single path", async () => {
    h.findByEmail.mockResolvedValue(null);

    await expect(
      membershipService.invite(contextWith("Owner"), {
        email: "nobody@desta.works",
        role: "Associate",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.upsertInvitation).not.toHaveBeenCalled();
  });

  it("refuses to re-invite somebody who is already an active member", async () => {
    h.findByEmail.mockResolvedValue({ id: "u2" });
    h.findActorById.mockResolvedValue({
      id: "u2",
      email: "john@desta.works",
      name: "John Roe",
    });
    h.findByTenantAndUser.mockResolvedValue(membership({ status: "active" }));

    await expect(
      membershipService.invite(contextWith("Owner"), {
        email: "john@desta.works",
        role: "Owner",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.upsertInvitation).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation", () => {
  it("announces the membership's own tenant, or RLS refuses the audit row", async () => {
    announced.length = 0;
    h.findByUserAndSlug.mockResolvedValue(
      membership({ id: "m9", status: "invited", userId: "u1" }),
    );
    h.updateStatus.mockResolvedValue(membership({ id: "m9", status: "active", userId: "u1" }));

    await membershipService.acceptInvitation(user, { tenant: "acme" });

    // An invitation carries no `TenantContext` — that is the point of accepting one — so the
    // tenant has to come off the membership row. Unannounced, the audit insert meets
    // `activity_log`'s WITH CHECK with a NULL `app.tenant_id` and the whole acceptance fails.
    expect(announced).toEqual(["t1"]);
  });

  it("flips the invitee's own membership to active and audits the change", async () => {
    h.findByUserAndSlug.mockResolvedValue(
      membership({ id: "m9", status: "invited", userId: "u1" }),
    );
    h.updateStatus.mockResolvedValue(membership({ id: "m9", status: "active", userId: "u1" }));

    const result = await membershipService.acceptInvitation(user, { tenant: "acme" });

    expect(h.findByUserAndSlug).toHaveBeenCalledWith("u1", "acme");
    expect(h.updateStatus).toHaveBeenCalledWith("m9", "active", { tx: true });
    expect(result.tenant).toMatchObject({ slug: "acme", status: "active" });
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({ action: "accept_invite", actor: "u1", tenantId: "t1" }),
    );
  });

  /** Only the invitee can accept: the lookup is keyed by the SIGNED-IN user's id, so there is no
   *  argument through which one person could accept another's invitation. */
  it("looks the membership up by the signed-in user, never by anything the caller supplied", async () => {
    h.findByUserAndSlug.mockResolvedValue(null);

    await expect(
      membershipService.acceptInvitation(user, { tenant: "northwind" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.findByUserAndSlug).toHaveBeenCalledWith("u1", "northwind");
    expect(h.updateStatus).not.toHaveBeenCalled();
  });

  it("refuses to re-accept a membership that is already active", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ status: "active", userId: "u1" }));

    await expect(
      membershipService.acceptInvitation(user, { tenant: "acme" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to resurrect a removed membership through the accept path", async () => {
    h.findByUserAndSlug.mockResolvedValue(membership({ status: "removed", userId: "u1" }));

    await expect(
      membershipService.acceptInvitation(user, { tenant: "acme" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.updateStatus).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("marks the membership removed and audits it — access ends on the next request", async () => {
    h.findByIdInTenant.mockResolvedValue(membership({ status: "active" }));
    h.updateStatus.mockResolvedValue(membership({ status: "removed" }));

    const result = await membershipService.remove(contextWith("Owner"), "m2");

    expect(h.findByIdInTenant).toHaveBeenCalledWith("t1", "m2");
    expect(h.updateStatus).toHaveBeenCalledWith("m2", "removed", { tx: true });
    expect(result.member.status).toBe("removed");
    expect(h.writeAudit).toHaveBeenCalledWith(
      { tx: true },
      expect.objectContaining({ action: "remove_member", actor: "u1", tenantId: "t1" }),
    );
  });

  it("cannot reach a membership in another tenant — the tenant id is part of the predicate", async () => {
    h.findByIdInTenant.mockResolvedValue(null);

    await expect(
      membershipService.remove(contextWith("Owner"), "m-elsewhere"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.findByIdInTenant).toHaveBeenCalledWith("t1", "m-elsewhere");
  });

  it("refuses to remove the last member who can administer the workspace", async () => {
    h.findByIdInTenant.mockResolvedValue(membership({ role: "Owner", status: "active" }));
    h.countActiveByRole.mockResolvedValue(1);

    await expect(membershipService.remove(contextWith("Owner"), "m2")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.updateStatus).not.toHaveBeenCalled();
  });

  it("counts administrators by CAPABILITY, so Owner and Admin both count and Director does not", async () => {
    h.findByIdInTenant.mockResolvedValue(membership({ role: "Owner", status: "active" }));
    h.countActiveByRole.mockResolvedValue(2);

    await membershipService.remove(contextWith("Owner"), "m2");

    expect(h.countActiveByRole).toHaveBeenCalledWith("t1", ["Owner", "Admin"]);
  });

  it("does not run the last-administrator check for a member who cannot administer", async () => {
    h.findByIdInTenant.mockResolvedValue(membership({ role: "Screener", status: "active" }));
    h.updateStatus.mockResolvedValue(membership({ role: "Screener", status: "removed" }));

    await membershipService.remove(contextWith("Owner"), "m2");

    expect(h.countActiveByRole).not.toHaveBeenCalled();
  });

  it("refuses a second removal rather than writing a second audit row", async () => {
    h.findByIdInTenant.mockResolvedValue(membership({ status: "removed" }));

    await expect(membershipService.remove(contextWith("Owner"), "m2")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("listForUser", () => {
  it("answers with the workspaces the resolution path says are available", async () => {
    h.listTenantChoices.mockResolvedValue([
      { tenantId: "t1", slug: "acme", name: "Acme Health", role: "Owner", status: "active" },
    ]);

    await expect(membershipService.listForUser(user)).resolves.toEqual({
      tenants: [
        { tenantId: "t1", slug: "acme", name: "Acme Health", role: "Owner", status: "active" },
      ],
    });
  });
});
