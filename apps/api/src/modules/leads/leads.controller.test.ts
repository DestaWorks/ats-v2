import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `LeadsController` — the contract test for the 13 endpoints ported from
 * `apps/web/src/app/api/leads/**` plus `/api/sourcing/similar`.
 *
 * Three things are checked, because three different mistakes are possible:
 *
 *  - the DECLARED route table (verb, path, guard, capability, status) still matches the Next.js
 *    routes it replaces — decorator metadata is invisible to the compiler, so nothing else catches
 *    a route that quietly moved or lost its guard;
 *  - each handler delegates with the arguments the route delegated with, and wraps the answer in
 *    the contract's envelope — no more, no less;
 *  - the guard refuses an unauthenticated caller BEFORE the handler runs, so a denial cannot be
 *    observed as a 500 or, worse, as data.
 *
 * Only the Better Auth session is mocked, so the real `requireUser` chain runs.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
}));

vi.mock("@destaworks/auth/auth", () => ({
  auth: { api: { getSession: async () => h.session } },
}));
vi.mock("@destaworks/application/lead.service", () => ({ leadService: {} }));
vi.mock("@destaworks/application/similarity.service", () => ({ similarityService: {} }));

import type { AuthUser } from "@destaworks/auth/guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { LeadsController } from "./leads.controller";

installNestRequestContext();

type LeadService = ConstructorParameters<typeof LeadsController>[0];

/** A controller wired to only the service methods the case under test drives. */
function controllerWith(methods: Partial<LeadService>): LeadsController {
  return new LeadsController(serviceStub<LeadService>(methods));
}

const USER: AuthUser = {
  id: "u1",
  email: "op@desta.works",
  name: "Operator",
  role: "Associate",
};

/** A lead detail stands in for the DTO: the controller passes it through, it never inspects it. */
const LEAD = { id: "lead_1", name: "A. Bekele" };

beforeEach(() => {
  h.session = null;
});

describe("LeadsController — declared routes", () => {
  it("matches the Next.js route table it replaces, verb for verb and guard for guard", () => {
    const session = ["SessionAuthGuard"];
    expect(describeRoutes(LeadsController)).toEqual([
      { route: "POST /leads", guards: session, capability: null, rateLimit: null, status: 201 },
      { route: "GET /leads/list", guards: session, capability: null, rateLimit: null, status: 200 },
      {
        route: "POST /leads/bulk",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /leads/import",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      { route: "GET /leads/:id", guards: session, capability: null, rateLimit: null, status: 200 },
      {
        route: "DELETE /leads/:id",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /leads/:id/promote",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /leads/:id/respond",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /leads/:id/snooze",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /leads/:id/restore",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /leads/:id/outreach",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "PATCH /leads/:id/outreach/:attemptId",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "DELETE /leads/:id/outreach/:attemptId",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
    ]);
  });

  it("declares GET /leads/list before GET /leads/:id, or `list` would be matched as an id", () => {
    const paths = describeRoutes(LeadsController).map((r) => r.route);
    expect(paths.indexOf("GET /leads/list")).toBeLessThan(paths.indexOf("GET /leads/:id"));
  });
});

describe("LeadsController — delegation and response envelope", () => {
  it("POST /leads creates and returns the lead envelope", async () => {
    const create = vi.fn().mockResolvedValue(LEAD);
    const body = { name: "A. Bekele", email: "a@example.com" };

    expect(await controllerWith({ create }).create(body, USER)).toEqual({ lead: LEAD });
    expect(create).toHaveBeenCalledWith(body, USER);
  });

  it("GET /leads/list renames `deleted` to `includeDeleted` and drops the absent filters", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });

    await controllerWith({ list }).list({ status: "Sourced", deleted: true, page: 2 });

    expect(list).toHaveBeenCalledWith({ status: "Sourced", page: 2, includeDeleted: true });
  });

  it("GET /leads/list passes the page through untouched when no filter is set", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });

    await controllerWith({ list }).list({});

    expect(list).toHaveBeenCalledWith({});
  });

  it("POST /leads/bulk returns the service's counts unwrapped", async () => {
    const bulkAction = vi.fn().mockResolvedValue({ affected: 3, skipped: 1 });
    const body = { ids: ["a"], action: "delete" as const };

    expect(await controllerWith({ bulkAction }).bulk(body, USER)).toEqual({
      affected: 3,
      skipped: 1,
    });
    expect(bulkAction).toHaveBeenCalledWith(body, USER);
  });

  it("POST /leads/import returns the per-chunk counts unwrapped", async () => {
    const importLeads = vi.fn().mockResolvedValue({ added: 5, skipped: 2 });
    const body = { rows: [] };

    expect(await controllerWith({ importLeads }).import(body, USER)).toEqual({
      added: 5,
      skipped: 2,
    });
    expect(importLeads).toHaveBeenCalledWith(body, USER);
  });

  it("GET /leads/:id returns the lead envelope", async () => {
    const detail = vi.fn().mockResolvedValue(LEAD);

    expect(await controllerWith({ detail }).detail("lead_1")).toEqual({ lead: LEAD });
    expect(detail).toHaveBeenCalledWith("lead_1");
  });

  it("DELETE /leads/:id answers with the id alone — never the deleted lead", async () => {
    const softDelete = vi.fn().mockResolvedValue({ id: "lead_1", name: "A. Bekele" });

    const response = await controllerWith({ softDelete }).remove("lead_1", USER);

    expect(response).toEqual({ ok: true, id: "lead_1" });
    expect(JSON.stringify(response)).not.toContain("Bekele");
  });

  it("POST /leads/:id/promote returns the new candidate id", async () => {
    const promote = vi.fn().mockResolvedValue({ candidateId: "cand_9" });

    expect(await controllerWith({ promote }).promote("lead_1", USER)).toEqual({
      candidateId: "cand_9",
    });
    expect(promote).toHaveBeenCalledWith("lead_1", USER);
  });

  it("POST /leads/:id/respond passes the parsed kind, not the whole body", async () => {
    const respond = vi.fn().mockResolvedValue(LEAD);

    expect(await controllerWith({ respond }).respond("lead_1", { kind: "hot" }, USER)).toEqual({
      lead: LEAD,
    });
    expect(respond).toHaveBeenCalledWith("lead_1", "hot", USER);
  });

  it("POST /leads/:id/snooze passes `until` through, including the null that wakes a lead", async () => {
    const snooze = vi.fn().mockResolvedValue(LEAD);

    await controllerWith({ snooze }).snooze("lead_1", { until: null }, USER);

    expect(snooze).toHaveBeenCalledWith("lead_1", null, USER);
  });

  it("POST /leads/:id/restore returns the lead envelope", async () => {
    const restore = vi.fn().mockResolvedValue(LEAD);

    expect(await controllerWith({ restore }).restore("lead_1", USER)).toEqual({ lead: LEAD });
    expect(restore).toHaveBeenCalledWith("lead_1", USER);
  });

  it("POST /leads/:id/outreach logs the attempt and returns the fresh lead", async () => {
    const logOutreach = vi.fn().mockResolvedValue(LEAD);
    const body = { channel: "email" } as const;

    expect(await controllerWith({ logOutreach }).logOutreach("lead_1", body, USER)).toEqual({
      lead: LEAD,
    });
    expect(logOutreach).toHaveBeenCalledWith("lead_1", body, USER);
  });

  it("PATCH /leads/:id/outreach/:attemptId scopes the edit to both ids", async () => {
    const updateOutreach = vi.fn().mockResolvedValue(LEAD);
    const body = { note: "left a voicemail" };

    expect(
      await controllerWith({ updateOutreach }).updateOutreach("lead_1", "att_2", body, USER),
    ).toEqual({ lead: LEAD });
    expect(updateOutreach).toHaveBeenCalledWith("lead_1", "att_2", body, USER);
  });

  it("DELETE /leads/:id/outreach/:attemptId scopes the delete to both ids", async () => {
    const deleteOutreach = vi.fn().mockResolvedValue(LEAD);

    expect(
      await controllerWith({ deleteOutreach }).deleteOutreach("lead_1", "att_2", USER),
    ).toEqual({ lead: LEAD });
    expect(deleteOutreach).toHaveBeenCalledWith("lead_1", "att_2", USER);
  });
});

describe("LeadsController — authentication", () => {
  it("refuses an unauthenticated caller with 401 before the handler runs", async () => {
    const detail = vi.fn();

    await expect(
      throughGuards({
        controller: LeadsController,
        method: "detail",
        guards: [new SessionAuthGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ detail }).detail("lead_1"),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(detail).not.toHaveBeenCalled();
  });

  it("admits any signed-in operator — sourcing carries no capability gate (L-7)", async () => {
    h.session = {
      user: { id: "u1", email: "op@desta.works", name: "Operator", role: "Associate" },
    };
    const detail = vi.fn().mockResolvedValue(LEAD);

    const response = await throughGuards({
      controller: LeadsController,
      method: "detail",
      guards: [new SessionAuthGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ detail }).detail("lead_1"),
    });

    expect(response).toEqual({ lead: LEAD });
  });
});
