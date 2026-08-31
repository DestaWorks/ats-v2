import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `adminUserService` wraps Better Auth's admin plugin (`auth.api.*`) — no repository/Prisma of
 * its own. Verifies each method calls the right endpoint with the right body/headers, and that
 * `create`/`resetPassword` generate + return a password when none is supplied.
 */

const h = vi.hoisted(() => {
  const fakeTx = { __tx: true };
  return {
    fakeTx,
    upsertMembership: vi.fn().mockResolvedValue({ id: "m_new" }),
    findByTenantAndUser: vi.fn(),
    listAdminUsersByTenant: vi.fn(),
    createUser: vi.fn(),
    setRole: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    setUserPassword: vi.fn(),
    removeUser: vi.fn(),
    /**
     * Stands in for the real writer AND for the column constraint behind it: `activity_log`
     * .`tenantId` is NOT NULL, and the raw client `withAnnouncedTenant` yields has no seam to
     * stamp it. A mock that accepted anything is why a missing `tenantId` shipped — every
     * mutation 500'd after its destructive half had already committed, and the suite stayed green.
     */
    writeAudit: vi.fn((tx: unknown, params: { tenantId?: string }) => {
      if (tx === fakeTx && params.tenantId === undefined) {
        throw new Error("activity_log.tenantId is NOT NULL — required on a raw transaction");
      }
    }),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers({ cookie: "session=abc" }) }),
}));
vi.mock("@destaworks/auth/auth", () => ({
  auth: {
    api: {
      createUser: h.createUser,
      setRole: h.setRole,
      banUser: h.banUser,
      unbanUser: h.unbanUser,
      setUserPassword: h.setUserPassword,
      removeUser: h.removeUser,
    },
  },
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@destaworks/db/tenancy/membership.repository", () => ({
  membershipRepository: {
    upsertMembership: h.upsertMembership,
    findByTenantAndUser: h.findByTenantAndUser,
  },
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({
  userRepository: { listAdminUsersByTenant: h.listAdminUsersByTenant },
}));
const announced: string[] = vi.hoisted(() => []);

vi.mock("@destaworks/db/tenant-transaction", () => ({
  withAnnouncedTenant: (tenantId: string, fn: (tx: unknown) => unknown) => {
    announced.push(tenantId);
    return fn(h.fakeTx);
  },
}));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { adminUserService } from "./admin-user.service";

const baseUser = {
  id: "u1",
  name: "Ann Owner",
  email: "ann@desta.works",
  role: "Owner",
  banned: false,
  banReason: null,
  banExpires: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  h.listAdminUsersByTenant.mockReset();
  h.createUser.mockReset();
  h.setRole.mockReset();
  h.banUser.mockReset();
  h.unbanUser.mockReset();
  h.setUserPassword.mockReset();
  h.removeUser.mockReset();
  // `mockClear`, not `mockReset`: the invariant above is the point of this mock.
  h.writeAudit.mockClear();
  h.findByTenantAndUser.mockReset();
  h.findByTenantAndUser.mockResolvedValue({ id: "m1", tenantId: "t1", userId: "u1" });
});

const adminCtx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "actor1", email: "admin@desta.works", name: "Admin" },
};

describe("adminUserService.list", () => {
  it("reads only THIS workspace's members and maps the DTOs", async () => {
    h.listAdminUsersByTenant.mockResolvedValue([{ ...baseUser, image: null }]);
    const result = await adminUserService.list(adminCtx);
    expect(h.listAdminUsersByTenant).toHaveBeenCalledWith("t1");
    expect(result).toEqual({
      users: [
        {
          id: "u1",
          name: "Ann Owner",
          email: "ann@desta.works",
          image: null,
          role: "Owner",
          banned: false,
          banReason: null,
          banExpires: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
    });
  });
});

describe("adminUserService.create", () => {
  it("announces the ACTING admin's tenant, or RLS refuses the audit row", async () => {
    announced.length = 0;
    h.createUser.mockResolvedValue({ user: baseUser });

    await adminUserService.create(adminCtx, {
      name: "Ann Owner",
      email: "ann@desta.works",
      role: "Owner",
    });

    // This service holds no repository — only Better Auth plus six audit writes into
    // `activity_log`, which is tenant-scoped with a WITH CHECK policy. Unannounced they are
    // refused under RLS, and the admin surface fails with them.
    expect(announced).toEqual(["t1"]);
  });

  it("forwards the given password verbatim and returns no generated password", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    const result = await adminUserService.create(adminCtx, {
      name: "Ann Owner",
      email: "ann@desta.works",
      role: "Owner",
      password: "supplied-pw-123",
    });
    expect(h.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ password: "supplied-pw-123" }),
      }),
    );
    expect(result.generatedPassword).toBeNull();
  });

  it("generates a password and returns it once when none is supplied", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    const result = await adminUserService.create(adminCtx, {
      name: "Ann Owner",
      email: "ann@desta.works",
      role: "Owner",
    });
    expect(result.generatedPassword).toBeTruthy();
    expect(h.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ password: result.generatedPassword }),
      }),
    );
  });

  it("marks the new account emailVerified — required for Better Auth to later link a same-email Google sign-in", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    await adminUserService.create(adminCtx, {
      name: "Ann Owner",
      email: "ann@desta.works",
      role: "Owner",
      password: "supplied-pw-123",
    });
    expect(h.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ data: { emailVerified: true } }),
      }),
    );
  });

  it("writes an audit entry for the acting admin", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    await adminUserService.create(adminCtx, {
      name: "Ann Owner",
      email: "ann@desta.works",
      role: "Owner",
    });
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({
        entity: "user",
        entityId: "u1",
        actor: "actor1",
        action: "create",
      }),
    );
  });

  it("grants an ACTIVE membership in the acting admin's workspace, or the account is unusable", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    await adminUserService.create(adminCtx, {
      name: "New",
      email: "new@desta.works",
      role: "Associate",
    });

    expect(h.upsertMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: adminCtx.tenantId,
        role: "Associate",
        invitedById: adminCtx.user.id,
      }),
      expect.anything(),
    );
  });

  it("does not leave the account merely invited — there is nobody to accept", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    h.upsertMembership.mockClear();
    await adminUserService.create(adminCtx, {
      name: "New",
      email: "new@desta.works",
      role: "Associate",
    });

    const [payload] = h.upsertMembership.mock.calls[0] ?? [];
    expect(payload).not.toHaveProperty("status", "invited");
    expect(h.writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entity: "membership", action: "create" }),
    );
  });
});

describe("adminUserService.setRole", () => {
  it("calls setRole with userId + role, and audits the change", async () => {
    h.setRole.mockResolvedValue({ user: { ...baseUser, role: "Manager" } });
    const result = await adminUserService.setRole(adminCtx, "u1", "Manager");
    expect(h.setRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "u1", role: "Manager" } }),
    );
    expect(result.role).toBe("Manager");
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({
        entity: "user",
        entityId: "u1",
        actor: "actor1",
        action: "setRole",
      }),
    );
  });
});

describe("adminUserService.ban / unban", () => {
  it("converts expiresInDays to banExpiresIn seconds, and audits the ban", async () => {
    h.banUser.mockResolvedValue({ user: { ...baseUser, banned: true } });
    await adminUserService.ban(adminCtx, "u1", { reason: "abuse", expiresInDays: 2 });
    expect(h.banUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: "u1", banReason: "abuse", banExpiresIn: 2 * 86_400 },
      }),
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "user", entityId: "u1", actor: "actor1", action: "ban" }),
    );
  });

  it("unban calls unbanUser with the userId, and audits the unban", async () => {
    h.unbanUser.mockResolvedValue({ user: baseUser });
    await adminUserService.unban(adminCtx, "u1");
    expect(h.unbanUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: "u1" } }));
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "user", entityId: "u1", actor: "actor1", action: "unban" }),
    );
  });
});

describe("adminUserService.resetPassword", () => {
  it("generates and returns a password once, and audits the reset without the password", async () => {
    h.setUserPassword.mockResolvedValue({ status: true });
    const result = await adminUserService.resetPassword(adminCtx, "u1");
    expect(result.generatedPassword).toBeTruthy();
    expect(h.setUserPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: "u1", newPassword: result.generatedPassword },
      }),
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({
        entity: "user",
        entityId: "u1",
        actor: "actor1",
        action: "resetPassword",
      }),
    );
    const [, auditParams] = h.writeAudit.mock.calls[0]!;
    expect(JSON.stringify(auditParams)).not.toContain(result.generatedPassword);
  });
});

describe("adminUserService.remove", () => {
  it("calls removeUser with the userId, and audits the removal", async () => {
    h.removeUser.mockResolvedValue({ success: true });
    await adminUserService.remove(adminCtx, "u1");
    expect(h.removeUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: "u1" } }));
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({
        entity: "user",
        entityId: "u1",
        actor: "actor1",
        action: "remove",
      }),
    );
  });
});

/**
 * Regression for the cross-tenant admin plane.
 *
 * `requireCapability` in the controller proves the ACTOR may administer accounts in the workspace
 * they are signed in to. It never looked at the TARGET, and `auth.api.*` addresses the global
 * `User` table by id — so an administrator of one workspace could name any user id on the
 * installation and ban, delete, re-role or reset the password of another customer's staff. Each
 * case below drives the target's membership lookup to `null` and asserts the Better Auth call is
 * never reached: the destructive half lands FIRST, so refusing afterwards is not refusing at all.
 */
describe("adminUserService — a target outside the acting workspace", () => {
  beforeEach(() => {
    h.findByTenantAndUser.mockResolvedValue(null);
  });

  it("refuses setRole and never calls Better Auth", async () => {
    await expect(adminUserService.setRole(adminCtx, "victim", "Owner")).rejects.toThrow();
    expect(h.setRole).not.toHaveBeenCalled();
  });

  it("refuses ban and never calls Better Auth", async () => {
    await expect(adminUserService.ban(adminCtx, "victim", { reason: null })).rejects.toThrow();
    expect(h.banUser).not.toHaveBeenCalled();
  });

  it("refuses unban and never calls Better Auth", async () => {
    await expect(adminUserService.unban(adminCtx, "victim")).rejects.toThrow();
    expect(h.unbanUser).not.toHaveBeenCalled();
  });

  it("refuses resetPassword and never calls Better Auth", async () => {
    await expect(adminUserService.resetPassword(adminCtx, "victim")).rejects.toThrow();
    expect(h.setUserPassword).not.toHaveBeenCalled();
  });

  it("refuses remove and never calls Better Auth", async () => {
    await expect(adminUserService.remove(adminCtx, "victim")).rejects.toThrow();
    expect(h.removeUser).not.toHaveBeenCalled();
  });

  it("answers NOT_FOUND, so the id is not an oracle for accounts in other workspaces", async () => {
    await expect(adminUserService.remove(adminCtx, "victim")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("looks the target up in the ACTING workspace, not one named by the caller", async () => {
    await expect(adminUserService.remove(adminCtx, "victim")).rejects.toThrow();
    expect(h.findByTenantAndUser).toHaveBeenCalledWith("t1", "victim");
  });
});
