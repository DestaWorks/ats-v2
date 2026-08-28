import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for the seven `/api/admin/users*` routes against the Next.js handlers they
 * replace. This is the most authorization-sensitive controller in the app: it bans accounts,
 * lifts bans, changes roles, resets passwords and deletes users.
 *
 * Two things are asserted for every route. The DECLARED capability, read off the handler's own
 * decorator, must be the one the Next.js route enforces today — `manageRoles` on the role change
 * and `manageUsers` everywhere else, never widened to one uniform gate. And the denials: signed
 * out is 401, an authenticated role that does not hold the capability is 403, and neither reaches
 * the service.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
  create: vi.fn(),
  setRole: vi.fn(),
  ban: vi.fn(),
  unban: vi.fn(),
  resetPassword: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/application/admin-user.service", () => ({ adminUserService: h }));
// The module's other two services are bound to tokens beside this one; stubbed so importing the
// token file does not drag their repositories in for a test that never calls them.
vi.mock("@destaworks/application/access-request.service", () => ({ accessRequestService: {} }));
vi.mock("@destaworks/application/ai-ops.service", () => ({ aiOpsService: {} }));

import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "@destaworks/auth/guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import type { AuthenticatedRequest } from "../../common/guards/authenticated-request";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  boundPipes,
  injectedTokens,
  renderFailure,
  routeOf,
  runDeclaredGuards,
} from "../../common/testing/route-parity";
import { ADMIN_USER_SERVICE } from "./admin.tokens";
import { AdminUsersController } from "./admin-users.controller";

installNestRequestContext();

const USER = {
  id: "u9",
  name: "Jane",
  email: "jane@desta.works",
  image: null,
  role: "Associate",
  banned: false,
  banReason: null,
  banExpires: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const controller = (): AdminUsersController =>
  new AdminUsersController({
    list: h.list,
    create: h.create,
    setRole: h.setRole,
    ban: h.ban,
    unban: h.unban,
    resetPassword: h.resetPassword,
    remove: h.remove,
  });

/** The actor every mutation attributes itself to — resolved by the real guard chain, not invented. */
async function admitted(handlerName: string): Promise<AuthUser> {
  h.session = { user: { id: "owner1", email: "o@desta.works", name: "O", role: "Owner" } };
  const request: AuthenticatedRequest = { headers: {} };
  await runDeclaredGuards(AdminUsersController, handlerName, request);
  const { user } = request;
  if (!user) throw new Error("the guard chain admitted the request without attaching a user");
  return user;
}

function denyingAs(role: string | null, handlerName: string): Promise<unknown> {
  h.session =
    role === null ? null : { user: { id: "d1", email: "d@desta.works", name: "D", role } };
  return renderFailure(() =>
    runDeclaredGuards(AdminUsersController, handlerName, { headers: {} } as AuthenticatedRequest),
  );
}

const UNAUTHORIZED = {
  status: 401,
  body: { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
};
const FORBIDDEN = {
  status: 403,
  body: { error: { code: "FORBIDDEN", message: "You don't have permission to do that" } },
};

/** Handler → the capability the Next.js route enforces today. Nothing here may be "close enough". */
const GATES = {
  list: "manageUsers",
  create: "manageUsers",
  remove: "manageUsers",
  ban: "manageUsers",
  unban: "manageUsers",
  setRole: "manageRoles",
  resetPassword: "manageUsers",
} as const;

beforeEach(() => {
  h.session = null;
  for (const fn of [h.list, h.create, h.setRole, h.ban, h.unban, h.resetPassword, h.remove]) {
    fn.mockReset();
  }
});

describe("the admin user routes keep the Next.js verbs, paths and statuses", () => {
  it("mounts every handler where its route was", () => {
    expect(routeOf(AdminUsersController, "list")).toMatchObject({
      method: "GET",
      path: "/admin/users",
      status: 200,
    });
    expect(routeOf(AdminUsersController, "create")).toMatchObject({
      method: "POST",
      path: "/admin/users",
      status: 201,
    });
    expect(routeOf(AdminUsersController, "remove")).toMatchObject({
      method: "DELETE",
      path: "/admin/users/:id",
      status: 200,
    });
    expect(routeOf(AdminUsersController, "setRole")).toMatchObject({
      method: "PATCH",
      path: "/admin/users/:id/role",
      status: 200,
    });
  });

  it("answers 200 on ban, unban and reset-password — only account creation is a 201", () => {
    for (const handler of ["ban", "unban", "resetPassword"] as const) {
      expect(routeOf(AdminUsersController, handler).status).toBe(200);
      expect(routeOf(AdminUsersController, handler).method).toBe("POST");
    }
  });

  it("injects the admin user service by token — never the imported singleton", () => {
    expect(injectedTokens(AdminUsersController)).toEqual([ADMIN_USER_SERVICE]);
  });
});

describe("authorization — the declared gate per route", () => {
  it("declares exactly the capability the Next.js route enforces, route by route", () => {
    for (const [handler, capability] of Object.entries(GATES)) {
      expect(routeOf(AdminUsersController, handler)).toMatchObject({
        capability,
        guards: ["SessionAuthGuard", "CapabilityGuard"],
      });
    }
  });

  it("401s every route signed out", async () => {
    for (const handler of Object.keys(GATES)) {
      expect(await denyingAs(null, handler), handler).toEqual(UNAUTHORIZED);
    }
  });

  it("403s every route for a leadership role that holds no admin capability", async () => {
    for (const handler of Object.keys(GATES)) {
      expect(await denyingAs("Director", handler), handler).toEqual(FORBIDDEN);
    }
  });

  it("never reaches the service on a refusal", () => {
    for (const fn of [h.list, h.create, h.setRole, h.ban, h.unban, h.resetPassword, h.remove]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe("GET/POST /admin/users", () => {
  it("lists accounts", async () => {
    h.list.mockResolvedValue({ users: [USER], total: 1 });
    expect(await controller().list()).toEqual({ users: [USER], total: 1 });
  });

  it("creates one and returns the one-time password, attributed to the session actor", async () => {
    h.create.mockResolvedValue({ user: USER, generatedPassword: "pw" });
    const actor = await admitted("create");
    const body = { name: "Jane", email: "jane@desta.works", role: "Associate" as const };
    expect(await controller().create(actor, body)).toEqual({ user: USER, generatedPassword: "pw" });
    expect(h.create).toHaveBeenCalledWith(body, "owner1");
  });

  it("validates the create body with the contract schema, answering 422 + issues", async () => {
    const [pipe] = boundPipes(AdminUsersController, "create");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(
      await renderFailure(() => pipe?.transform({ name: "J", email: "nope", role: "Wizard" })),
    ).toMatchObject({ status: 422, body: { error: { code: "BAD_REQUEST" } } });
  });
});

describe("the account mutations", () => {
  it("bans and returns the account wrapped in the route's own envelope", async () => {
    h.ban.mockResolvedValue({ ...USER, banned: true });
    const actor = await admitted("ban");
    expect(await controller().ban(actor, "u9", { reason: "spam", expiresInDays: 7 })).toEqual({
      user: { ...USER, banned: true },
    });
    expect(h.ban).toHaveBeenCalledWith("u9", { reason: "spam", expiresInDays: 7 }, "owner1");
  });

  it("unbans and returns the same envelope shape", async () => {
    h.unban.mockResolvedValue(USER);
    const actor = await admitted("unban");
    expect(await controller().unban(actor, "u9")).toEqual({ user: USER });
    expect(h.unban).toHaveBeenCalledWith("u9", "owner1");
  });

  it("sets a role and returns the same envelope shape", async () => {
    h.setRole.mockResolvedValue({ ...USER, role: "Manager" });
    const actor = await admitted("setRole");
    expect(await controller().setRole(actor, "u9", { role: "Manager" })).toEqual({
      user: { ...USER, role: "Manager" },
    });
    expect(h.setRole).toHaveBeenCalledWith("u9", "Manager", "owner1");
  });

  it("resets a password and returns it once", async () => {
    h.resetPassword.mockResolvedValue({ generatedPassword: "pw" });
    const actor = await admitted("resetPassword");
    expect(await controller().resetPassword(actor, "u9")).toEqual({ generatedPassword: "pw" });
    expect(h.resetPassword).toHaveBeenCalledWith("u9", "owner1");
  });

  it("deletes and acknowledges the id that was removed", async () => {
    h.remove.mockResolvedValue(undefined);
    const actor = await admitted("remove");
    expect(await controller().remove(actor, "u9")).toEqual({ ok: true, id: "u9" });
    expect(h.remove).toHaveBeenCalledWith("u9", "owner1");
  });

  it("carries an unknown user through as the route's 404 envelope", async () => {
    h.ban.mockRejectedValue(new AppError("NOT_FOUND", "User not found"));
    const actor = await admitted("ban");
    expect(await renderFailure(() => controller().ban(actor, "gone", { reason: null }))).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "User not found" } },
    });
  });

  it("never leaks a Prisma message on an unexpected failure", async () => {
    h.unban.mockRejectedValue(new Error("Unique constraint failed on jane@desta.works"));
    const actor = await admitted("unban");
    const failure = await renderFailure(() => controller().unban(actor, "u9"));
    expect(JSON.stringify(failure.body)).not.toContain("jane@desta.works");
    expect(failure.status).toBe(500);
  });
});
