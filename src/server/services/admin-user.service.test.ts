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
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=abc" }) }));
vi.mock("@/server/auth/auth", () => ({
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
  Object.values(h).forEach((fn) => fn.mockReset());
});

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
  it("forwards the given password verbatim and returns no generated password", async () => {
    h.createUser.mockResolvedValue({ user: baseUser });
    const result = await adminUserService.create({
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
    const result = await adminUserService.create({
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
});

describe("adminUserService.setRole", () => {
  it("calls setRole with userId + role", async () => {
    h.setRole.mockResolvedValue({ user: { ...baseUser, role: "Manager" } });
    const result = await adminUserService.setRole("u1", "Manager");
    expect(h.setRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { userId: "u1", role: "Manager" } }),
    );
    expect(result.role).toBe("Manager");
  });
});

describe("adminUserService.ban / unban", () => {
  it("converts expiresInDays to banExpiresIn seconds", async () => {
    h.banUser.mockResolvedValue({ user: { ...baseUser, banned: true } });
    await adminUserService.ban("u1", { reason: "abuse", expiresInDays: 2 });
    expect(h.banUser).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: "u1", banReason: "abuse", banExpiresIn: 2 * 86_400 },
      }),
    );
  });

  it("unban calls unbanUser with the userId", async () => {
    h.unbanUser.mockResolvedValue({ user: baseUser });
    await adminUserService.unban("u1");
    expect(h.unbanUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: "u1" } }));
  });
});

describe("adminUserService.resetPassword", () => {
  it("generates and returns a password once", async () => {
    h.setUserPassword.mockResolvedValue({ status: true });
    const result = await adminUserService.resetPassword("u1");
    expect(result.generatedPassword).toBeTruthy();
    expect(h.setUserPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { userId: "u1", newPassword: result.generatedPassword },
      }),
    );
  });
});

describe("adminUserService.remove", () => {
  it("calls removeUser with the userId", async () => {
    h.removeUser.mockResolvedValue({ success: true });
    await adminUserService.remove("u1");
    expect(h.removeUser).toHaveBeenCalledWith(expect.objectContaining({ body: { userId: "u1" } }));
  });
});
