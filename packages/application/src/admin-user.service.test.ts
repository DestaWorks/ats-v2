import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODULES, ROLE_CAPABILITIES } from "@destaworks/domain/constants";
import { AppError } from "@destaworks/integrations/http/app-error";

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
    listByUser: vi.fn(),
    findRoleById: vi.fn(),
    changeRole: vi.fn(),
    listAdminUsersByTenant: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(null),
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
    listByUser: h.listByUser,
  },
}));
vi.mock("@destaworks/db/tenancy/access-role.repository", () => ({
  accessRoleRepository: { findByIdInTenant: h.findRoleById },
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({
  userRepository: { listAdminUsersByTenant: h.listAdminUsersByTenant, findByEmail: h.findByEmail },
}));
// The authoritative half lives there now; this service resolves, delegates, and syncs.
vi.mock("./membership.service", () => ({ membershipService: { changeRole: h.changeRole } }));
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
  h.listByUser.mockReset();
  // The default target: a member of the acting workspace and of nowhere else.
  h.listByUser.mockResolvedValue([
    {
      id: "m1",
      tenantId: "t1",
      userId: "u1",
      status: "active",
      roleId: "ar_Associate",
      accessRole: { id: "ar_Associate", name: "Associate", capabilities: [] },
    },
  ]);
  h.findRoleById.mockImplementation(async (_t: string, id: string) => ({
    id,
    name: id.replace("ar_", ""),
    capabilities: id === "ar_Owner" || id === "ar_Admin" ? ["manageUsers"] : [],
    templateKey: id.replace("ar_", ""),
    isBuiltIn: true,
  }));
});

const adminCtx = {
  tenantId: "t1",
  membershipId: "m1",
  modules: MODULES,
  capabilities: ROLE_CAPABILITIES.Owner,
  role: "Owner" as const,
  user: { id: "actor1", email: "admin@desta.works", name: "Admin" },
};

describe("adminUserService.list", () => {
  it("reads only THIS workspace's members and maps the DTOs", async () => {
    h.listAdminUsersByTenant.mockResolvedValue([
      {
        ...baseUser,
        image: null,
        memberships: [{ roleId: "ar_Owner", accessRole: { name: "Owner" } }],
      },
    ]);
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
          roleId: "ar_Owner",
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
      roleId: "ar_Owner",
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
      roleId: "ar_Owner",
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
      roleId: "ar_Owner",
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
      roleId: "ar_Owner",
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
      roleId: "ar_Owner",
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
      roleId: "ar_Associate",
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
      roleId: "ar_Associate",
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
  beforeEach(() => {
    h.changeRole.mockReset();
    h.changeRole.mockResolvedValue({
      member: { membershipId: "m1", roleId: "ar_Manager", role: "Manager" },
    });
  });

  /** The defect this replaced: `auth.api.setRole` writes a column that authorizes nothing. */
  it("moves the MEMBERSHIP role, which is the one that authorizes anything", async () => {
    h.setRole.mockResolvedValue({ user: { ...baseUser, role: "Manager" } });

    await adminUserService.setRole(adminCtx, "u1", "ar_Manager");

    expect(h.changeRole).toHaveBeenCalledWith(adminCtx, "m1", { roleId: "ar_Manager" });
  });

  /** Better Auth asks one question of the column, so the role is reduced to it via `manageUsers`. */
  it("reduces the workspace role to the admin/not-admin flag Better Auth understands", async () => {
    h.setRole.mockResolvedValue({ user: { ...baseUser, role: "Associate" } });

    const result = await adminUserService.setRole(adminCtx, "u1", "ar_Manager");

    // Manager does not grant `manageUsers`, so Better Auth is told the non-admin value.
    expect(h.setRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "u1", role: "Associate" } }),
    );
    // What the caller sees is the MEMBERSHIP role, not the reduced one.
    expect(result.role).toBe("Manager");
  });

  it("tells Better Auth the admin value when the new role can administer the workspace", async () => {
    h.changeRole.mockResolvedValue({
      member: { membershipId: "m1", roleId: "ar_Owner", role: "Owner" },
    });
    h.setRole.mockResolvedValue({ user: { ...baseUser, role: "Owner" } });

    await adminUserService.setRole(adminCtx, "u1", "ar_Owner");

    expect(h.setRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "u1", role: "Owner" } }),
    );
  });

  it("does not touch Better Auth when the guarded membership change is refused", async () => {
    h.changeRole.mockRejectedValue(new AppError("CONFLICT", "last administrator"));

    await expect(adminUserService.setRole(adminCtx, "u1", "ar_Associate")).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(h.setRole).not.toHaveBeenCalled();
  });

  it("refuses an account that is not a member here, before any write", async () => {
    h.listByUser.mockResolvedValue([]);

    await expect(adminUserService.setRole(adminCtx, "u1", "ar_Manager")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(h.changeRole).not.toHaveBeenCalled();
    expect(h.setRole).not.toHaveBeenCalled();
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

describe("adminUserService guards the acting account", () => {
  it("refuses banning yourself, so the last administrator cannot lock the workspace", async () => {
    await expect(
      adminUserService.ban(adminCtx, adminCtx.user.id, { reason: null, expiresInDays: null }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.banUser).not.toHaveBeenCalled();
  });

  it("refuses removing yourself", async () => {
    await expect(adminUserService.remove(adminCtx, adminCtx.user.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.removeUser).not.toHaveBeenCalled();
  });
});

describe("adminUserService.create refuses a taken email", () => {
  it("answers CONFLICT rather than letting Better Auth raise an opaque failure", async () => {
    h.findByEmail.mockResolvedValueOnce({ id: "u-existing" });

    await expect(
      adminUserService.create(adminCtx, {
        name: "Ann Owner",
        email: "taken@desta.works",
        roleId: "ar_Owner",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.createUser).not.toHaveBeenCalled();
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
    h.listByUser.mockResolvedValue([]);
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

  it("looks the target up by account, then decides against the ACTING workspace", async () => {
    await expect(adminUserService.remove(adminCtx, "victim")).rejects.toThrow();
    expect(h.listByUser).toHaveBeenCalledWith("victim");
  });
});

/**
 * Scoping the LOOKUP is not scoping the EFFECT. Every mutation here reaches Better Auth, and those
 * operations are global — `removeUser` deletes the account, `banUser` locks it everywhere,
 * `setUserPassword` changes the one password it has. A membership check alone would let an
 * administrator of one workspace delete an account that is also a member of another customer's:
 * the target is legitimately theirs, the blast radius is not.
 */
describe("adminUserService — a target who also belongs to another workspace", () => {
  beforeEach(() => {
    h.listByUser.mockResolvedValue([
      {
        id: "m1",
        tenantId: "t1",
        userId: "u1",
        status: "active",
        roleId: "ar_Associate",
        accessRole: { id: "ar_Associate", name: "Associate", capabilities: [] },
      },
      {
        id: "m2",
        tenantId: "t2",
        userId: "u1",
        status: "active",
        roleId: "ar_Associate",
        accessRole: { id: "ar_Associate", name: "Associate", capabilities: [] },
      },
    ]);
  });

  it("refuses to DELETE the account, which would remove them from the other workspace too", async () => {
    await expect(adminUserService.remove(adminCtx, "u1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.removeUser).not.toHaveBeenCalled();
  });

  it("refuses to ban, which would lock them out everywhere", async () => {
    await expect(adminUserService.ban(adminCtx, "u1", { reason: null })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.banUser).not.toHaveBeenCalled();
  });

  it("refuses to reset the password they use in both workspaces", async () => {
    await expect(adminUserService.resetPassword(adminCtx, "u1")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.setUserPassword).not.toHaveBeenCalled();
  });

  it("refuses to change the role, which is written on the global account", async () => {
    await expect(adminUserService.setRole(adminCtx, "u1", "Owner")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.setRole).not.toHaveBeenCalled();
  });

  it("says WHY, since the caller may legitimately see this account", async () => {
    await expect(adminUserService.remove(adminCtx, "u1")).rejects.toThrow(/another workspace/i);
  });

  it("ignores a membership that was already removed elsewhere", async () => {
    h.listByUser.mockResolvedValue([
      {
        id: "m1",
        tenantId: "t1",
        userId: "u1",
        status: "active",
        roleId: "ar_Associate",
        accessRole: { id: "ar_Associate", name: "Associate", capabilities: [] },
      },
      {
        id: "m2",
        tenantId: "t2",
        userId: "u1",
        status: "removed",
        roleId: "ar_Associate",
        accessRole: { id: "ar_Associate", name: "Associate", capabilities: [] },
      },
    ]);
    h.removeUser.mockResolvedValue({ success: true });
    await expect(adminUserService.remove(adminCtx, "u1")).resolves.toBeUndefined();
  });
});
