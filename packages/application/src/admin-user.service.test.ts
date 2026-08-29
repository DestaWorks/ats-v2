import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `adminUserService` wraps Better Auth's admin plugin (`auth.api.*`) — no repository/Prisma of
 * its own. Verifies each method calls the right endpoint with the right body/headers, and that
 * `create`/`resetPassword` generate + return a password when none is supplied.
 */

const h = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  setRole: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  setUserPassword: vi.fn(),
  removeUser: vi.fn(),
  writeAudit: vi.fn(),
  fakeTx: { __tx: true },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers({ cookie: "session=abc" }) }),
}));
vi.mock("@destaworks/auth/auth", () => ({
  auth: {
    api: {
      listUsers: h.listUsers,
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
  h.listUsers.mockReset();
  h.createUser.mockReset();
  h.setRole.mockReset();
  h.banUser.mockReset();
  h.unbanUser.mockReset();
  h.setUserPassword.mockReset();
  h.removeUser.mockReset();
  h.writeAudit.mockReset();
});

const adminCtx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "actor1", email: "admin@desta.works", name: "Admin" },
};

describe("adminUserService.list", () => {
  it("calls listUsers with forwarded headers and maps the DTOs", async () => {
    h.listUsers.mockResolvedValue({ users: [baseUser], total: 1 });
    const result = await adminUserService.list();
    expect(h.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.any(Headers), query: expect.any(Object) }),
    );
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
