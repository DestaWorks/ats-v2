import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `RolesController` — the 12 endpoints ported from `apps/web/src/app/api/roles/**`.
 *
 * The area is deliberately MIXED: eleven routes are open to any signed-in operator and one,
 * `DELETE /roles/:id`, is a hard delete with no undo gated on `deleteOpenRole`. That asymmetry is
 * the thing most likely to be lost in a port — either by gating the whole class (which would lock
 * operators out of routes they have always had) or by forgetting the gate on the delete (which
 * would let any Associate destroy a requisition). Both directions are asserted below.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  checkRateLimit: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({
  auth: { api: { getSession: async () => h.session } },
}));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/open-role.service", () => ({ openRoleService: {} }));
vi.mock("@destaworks/integrations/http/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));

import type { AuthContext } from "@destaworks/auth/guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { RolesController } from "./roles.controller";

installNestRequestContext();

type OpenRoleService = ConstructorParameters<typeof RolesController>[0];

function controllerWith(methods: Partial<OpenRoleService>): RolesController {
  return new RolesController(serviceStub<OpenRoleService>(methods));
}

const USER: AuthContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "op@desta.works", name: "Operator" },
  role: "Associate",
};
const ROLE = { id: "role_1", title: "PMHNP — Telehealth" };

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "op@desta.works", name: "Operator", role } };
}

beforeEach(() => {
  h.session = null;
  h.checkRateLimit.mockReset();
});

describe("RolesController — declared routes", () => {
  it("matches the Next.js route table, including the one route with a capability gate", () => {
    const session = ["SessionAuthGuard"];
    const open = { guards: session, capability: null, rateLimit: null, status: 200 };
    expect(describeRoutes(RolesController)).toEqual([
      { ...open, route: "POST /roles", status: 201 },
      { ...open, route: "GET /roles" },
      { ...open, route: "GET /roles/triage" },
      {
        route: "POST /roles/parse-jd",
        guards: [...session, "RateLimitGuard"],
        capability: null,
        rateLimit: "roles-parse-jd",
        status: 200,
      },
      { ...open, route: "GET /roles/:id" },
      { ...open, route: "PATCH /roles/:id" },
      {
        route: "DELETE /roles/:id",
        guards: [...session, "CapabilityGuard"],
        capability: "deleteOpenRole",
        rateLimit: null,
        status: 200,
      },
      { ...open, route: "POST /roles/:id/promote" },
      { ...open, route: "GET /roles/:id/matches" },
      { ...open, route: "GET /roles/:id/dormant-matches" },
      { ...open, route: "GET /roles/:id/matches-and-dormant" },
      { ...open, route: "POST /roles/:id/notes", status: 201 },
      { ...open, route: "DELETE /roles/:id/notes/:noteId" },
    ]);
  });

  it("gates exactly one route — the irreversible hard delete, and nothing else", () => {
    const gated = describeRoutes(RolesController).filter((r) => r.capability !== null);
    expect(gated.map((r) => r.route)).toEqual(["DELETE /roles/:id"]);
  });

  it("declares the literal paths before `:id`, or `triage` would be matched as a role id", () => {
    const paths = describeRoutes(RolesController).map((r) => r.route);
    expect(paths.indexOf("GET /roles/triage")).toBeLessThan(paths.indexOf("GET /roles/:id"));
  });
});

describe("RolesController — delegation and response envelope", () => {
  it("POST /roles creates and returns the role envelope", async () => {
    const create = vi.fn().mockResolvedValue(ROLE);
    const body = { clientId: "cli_1", title: "PMHNP", priority: "P2" as const };

    expect(await controllerWith({ create }).create(body, USER)).toEqual({ role: ROLE });
    expect(create).toHaveBeenCalledWith(body, USER);
  });

  it("GET /roles drops the absent filters before handing the page query to the service", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });

    await controllerWith({ list }).list({ status: "Open", page: 3 }, USER);

    expect(list).toHaveBeenCalledWith({ status: "Open", page: 3 }, USER);
  });

  it("GET /roles/triage wraps the ranked roles", async () => {
    const triage = vi.fn().mockResolvedValue([ROLE]);

    expect(await controllerWith({ triage }).triage(USER)).toEqual({ roles: [ROLE] });
  });

  it("POST /roles/parse-jd returns the extraction unwrapped", async () => {
    const parsed = { title: "PMHNP", credential: "PMHNP" };
    const parseJd = vi.fn().mockResolvedValue(parsed);
    const body = { text: "We are hiring a PMHNP" };

    expect(await controllerWith({ parseJd }).parseJd(USER, body)).toBe(parsed);
    expect(parseJd).toHaveBeenCalledWith(USER, body);
  });

  it("GET /roles/:id returns the role envelope", async () => {
    const detail = vi.fn().mockResolvedValue(ROLE);

    expect(await controllerWith({ detail }).detail("role_1", USER)).toEqual({ role: ROLE });
    expect(detail).toHaveBeenCalledWith("role_1", USER);
  });

  it("PATCH /roles/:id passes the parsed body through", async () => {
    const update = vi.fn().mockResolvedValue(ROLE);
    const body = { status: "Filled" as const };

    expect(await controllerWith({ update }).update("role_1", body, USER)).toEqual({ role: ROLE });
    expect(update).toHaveBeenCalledWith("role_1", body, USER);
  });

  it("DELETE /roles/:id returns the id alone, with no `ok: true` a client could read as undoable", async () => {
    const remove = vi.fn().mockResolvedValue({ id: "role_1" });

    const response = await controllerWith({ remove }).remove("role_1", USER);

    expect(response).toEqual({ id: "role_1" });
    expect(response).not.toHaveProperty("ok");
  });

  it("POST /roles/:id/promote returns the new candidate id", async () => {
    const promote = vi.fn().mockResolvedValue({ candidateId: "cand_5" });
    const body = { leadId: "lead_1" };

    expect(await controllerWith({ promote }).promote("role_1", body, USER)).toEqual({
      candidateId: "cand_5",
    });
    expect(promote).toHaveBeenCalledWith("role_1", body, USER);
  });

  it("GET /roles/:id/matches and /dormant-matches use different matchers behind one envelope", async () => {
    const matches = vi.fn().mockResolvedValue([{ leadId: "l1" }]);
    const dormantMatches = vi.fn().mockResolvedValue([{ leadId: "l2" }]);
    const controller = controllerWith({ matches, dormantMatches });

    expect(await controller.matches("role_1", USER)).toEqual({ matches: [{ leadId: "l1" }] });
    expect(await controller.dormantMatches("role_1", USER)).toEqual({
      matches: [{ leadId: "l2" }],
    });
    expect(matches).toHaveBeenCalledTimes(1);
    expect(dormantMatches).toHaveBeenCalledTimes(1);
  });

  it("GET /roles/:id/matches-and-dormant answers both lists from ONE service call", async () => {
    const matchesAndDormant = vi.fn().mockResolvedValue({
      matches: [{ leadId: "l1" }],
      dormantMatches: [{ leadId: "l2" }],
    });
    const matches = vi.fn();
    const dormantMatches = vi.fn();

    const response = await controllerWith({
      matchesAndDormant,
      matches,
      dormantMatches,
    }).matchesAndDormant("role_1", USER);

    expect(response).toEqual({ matches: [{ leadId: "l1" }], dormantMatches: [{ leadId: "l2" }] });
    expect(matchesAndDormant).toHaveBeenCalledTimes(1);
    expect(matchesAndDormant).toHaveBeenCalledWith("role_1", USER);
    // The whole point of the composite: it must not fan back out into the two single-list reads.
    expect(matches).not.toHaveBeenCalled();
    expect(dormantMatches).not.toHaveBeenCalled();
  });

  it("keeps the two single-list endpoints, so a caller wanting one list still gets one", () => {
    const paths = describeRoutes(RolesController).map((r) => r.route);
    expect(paths).toContain("GET /roles/:id/matches");
    expect(paths).toContain("GET /roles/:id/dormant-matches");
  });

  it("POST /roles/:id/notes takes the author from the session, never the body", async () => {
    const addNote = vi.fn().mockResolvedValue(ROLE);
    const body = { body: "Client wants nights", category: "General" };

    expect(await controllerWith({ addNote }).addNote("role_1", body, USER)).toEqual({ role: ROLE });
    expect(addNote).toHaveBeenCalledWith("role_1", body, USER);
  });

  it("DELETE /roles/:id/notes/:noteId scopes the delete to both ids", async () => {
    const deleteNote = vi.fn().mockResolvedValue(ROLE);

    expect(await controllerWith({ deleteNote }).deleteNote("role_1", "note_2", USER)).toEqual({
      role: ROLE,
    });
    expect(deleteNote).toHaveBeenCalledWith("role_1", "note_2", USER);
  });
});

describe("RolesController — authorization", () => {
  it("refuses an unauthenticated caller with 401 on an open route", async () => {
    const detail = vi.fn();

    await expect(
      throughGuards({
        controller: RolesController,
        method: "detail",
        guards: [new SessionAuthGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ detail }).detail("role_1", USER),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(detail).not.toHaveBeenCalled();
  });

  it("admits any signed-in operator to the open routes", async () => {
    signInAs("Associate");
    const detail = vi.fn().mockResolvedValue(ROLE);

    const response = await throughGuards({
      controller: RolesController,
      method: "detail",
      guards: [new SessionAuthGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ detail }).detail("role_1", USER),
    });

    expect(response).toEqual({ role: ROLE });
  });

  it("refuses the hard delete to a Manager with 403 — the gate is not `signed in`", async () => {
    signInAs("Manager");
    const remove = vi.fn();

    await expect(
      throughGuards({
        controller: RolesController,
        method: "remove",
        guards: [new SessionAuthGuard(), new CapabilityGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ remove }).remove("role_1", USER),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(remove).not.toHaveBeenCalled();
  });

  it("admits the hard delete to an Owner", async () => {
    signInAs("Owner");
    const remove = vi.fn().mockResolvedValue({ id: "role_1" });

    const response = await throughGuards({
      controller: RolesController,
      method: "remove",
      guards: [new SessionAuthGuard(), new CapabilityGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ remove }).remove("role_1", USER),
    });

    expect(response).toEqual({ id: "role_1" });
  });

  it("spends the parse-jd bucket keyed exactly as the Next.js route keyed it", async () => {
    signInAs("Associate");
    const parseJd = vi.fn().mockResolvedValue({});

    await throughGuards({
      controller: RolesController,
      method: "parseJd",
      guards: [new SessionAuthGuard(), new RateLimitGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ parseJd }).parseJd(USER, { text: "hiring" }),
    });

    expect(h.checkRateLimit).toHaveBeenCalledWith("roles-parse-jd:u1", {
      limit: 20,
      windowMs: 60_000,
    });
  });
});
