import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `CapabilityGuard` — the 403 half of the surface, and the one that proves DECISIONS D3 holds:
 * authorization is a capability lookup, and denial is the default. Every case below is a REFUSAL
 * except the two that establish the guard admits anyone at all.
 *
 * Mocks only the Better Auth session, so the real `requireCapability` -> `hasCapability` chain runs
 * against the real role/capability table.
 */

vi.mock("server-only", () => ({}));

let mockSession: { user: { id: string; email: string; name: string; role?: string } } | null = null;

vi.mock("@destaworks/auth/auth", () => ({
  auth: { api: { getSession: async () => mockSession } },
}));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => mockSession),
}));

import { ROLES } from "@destaworks/domain/constants";
import { installNestRequestContext } from "../request-context/nest-request-context";
import { RequireCapability } from "../decorators/require-capability.decorator";
import { executionContextFor } from "./testing/execution-context.fixture";
import { CapabilityGuard } from "./capability.guard";
import type { AuthenticatedRequest } from "./authenticated-request";

installNestRequestContext();

const guard = new CapabilityGuard();

/** A handler carrying the metadata the real decorator writes — applied by calling it directly. */
function handlerRequiring(capability: Parameters<typeof RequireCapability>[0]): () => void {
  const handler = function guardedHandler(): void {};
  RequireCapability(capability)(handler);
  return handler;
}

function signInAs(role?: string): void {
  mockSession = {
    user: {
      id: "u1",
      email: "u@desta.works",
      name: "Test User",
      ...(role !== undefined && { role }),
    },
  };
}

beforeEach(() => {
  mockSession = null;
});

describe("CapabilityGuard — denial", () => {
  it("refuses an unauthenticated caller with UNAUTHORIZED, before any capability is considered", async () => {
    const request: AuthenticatedRequest = { headers: {} };
    const context = executionContextFor({ request, handler: handlerRequiring("viewReports") });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(request.user).toBeUndefined();
  });

  it("refuses an authenticated caller whose role does not grant the capability", async () => {
    signInAs("Associate");
    const request: AuthenticatedRequest = { headers: {} };
    const context = executionContextFor({ request, handler: handlerRequiring("viewReports") });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(request.user).toBeUndefined();
  });

  it("refuses a leadership role reaching for an admin-only capability", async () => {
    signInAs("Director");
    const request: AuthenticatedRequest = { headers: {} };
    const context = executionContextFor({ request, handler: handlerRequiring("manageUsers") });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a forged role rather than honouring it", async () => {
    signInAs("Superuser");
    const request: AuthenticatedRequest = { headers: {} };
    const context = executionContextFor({ request, handler: handlerRequiring("viewCredentials") });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a handler that declared no capability — a missing decorator fails closed", async () => {
    signInAs("Owner");
    const request: AuthenticatedRequest = { headers: {} };

    await expect(guard.canActivate(executionContextFor({ request }))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(request.user).toBeUndefined();
  });
});

describe("CapabilityGuard — grant", () => {
  it("admits a role that does grant the capability, and attaches the user", async () => {
    signInAs("Owner");
    const request: AuthenticatedRequest = { headers: {} };
    const context = executionContextFor({ request, handler: handlerRequiring("viewReports") });

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toMatchObject({
      tenantId: "t1",
      user: { id: "u1" },
      role: "Owner",
    });
  });

  it("reads the capability from the controller when the handler declares none", async () => {
    signInAs("Manager");
    const controller = class ReportsController {};
    RequireCapability("viewAnalytics")(controller);
    const request: AuthenticatedRequest = { headers: {} };

    expect(await guard.canActivate(executionContextFor({ request, controller }))).toBe(true);
  });
});

describe("the guards name no roles", () => {
  it("contains no role literal in any guard or decorator source", () => {
    const common = dirname(dirname(fileURLToPath(import.meta.url)));
    const files = [
      ...readdirSync(join(common, "guards")).map((f) => join(common, "guards", f)),
      ...readdirSync(join(common, "decorators")).map((f) => join(common, "decorators", f)),
    ].filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return ROLES.filter((role) => source.includes(role)).map((role) => `${file}: ${role}`);
    });

    // Load-bearing: Phase 6 moves `role` onto a membership. That is a change to `hasCapability`
    // and nothing else only for as long as no guard has an opinion about role names.
    expect(offenders).toEqual([]);
  });

  /**
   * The same rule, extended to the controllers in 6.4 — where the claim that moving `role` onto a
   * membership costs nothing above the guard was actually cashed in, and so is worth a check
   * rather than a note.
   *
   * The criterion is looser than for a guard on purpose: a controller's doc comment may explain a
   * policy in terms of who it affects ("Screeners hold no `viewCredentials`"), which is prose
   * about a capability, not a decision made on a name. What must not appear is a role as a
   * VALUE — a string literal — because that is the only form that can gate anything.
   */
  it("contains no role literal in any controller source", () => {
    const modules = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), "modules");
    const controllers = readdirSync(modules, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".controller.ts"))
      .map((f) => join(modules, f));

    expect(controllers.length).toBeGreaterThan(20);

    const offenders = controllers.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return ROLES.filter((role) => new RegExp(`["'\`]${role}["'\`]`).test(source)).map(
        (role) => `${file}: ${role}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});
