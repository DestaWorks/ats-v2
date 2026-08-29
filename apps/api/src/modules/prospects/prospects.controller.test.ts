import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `ProspectsController` — the 12 endpoints ported from `apps/web/src/app/api/prospects/**`.
 *
 * This is the leadership-gated half of my slice, so the capability is asserted twice over: once as
 * declared metadata on EVERY route (a class-level gate that a later method could not accidentally
 * escape), and once behaviourally, by running the real `CapabilityGuard` against a Screener — a
 * signed-in operator who simply does not hold `viewClientDiscovery` — and watching it refuse.
 *
 * Only the Better Auth session is mocked, so the real requireCapability -> hasCapability chain runs
 * against the real role table.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
}));

vi.mock("@destaworks/auth/auth", () => ({
  auth: { api: { getSession: async () => h.session } },
}));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/prospect.service", () => ({ prospectService: {} }));

import type { AuthContext } from "@destaworks/auth/guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { ProspectsController } from "./prospects.controller";

installNestRequestContext();

type ProspectService = ConstructorParameters<typeof ProspectsController>[0];

function controllerWith(methods: Partial<ProspectService>): ProspectsController {
  return new ProspectsController(serviceStub<ProspectService>(methods));
}

const USER: AuthContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "lead@desta.works", name: "Director" },
  role: "Director",
};
const PROSPECT = { id: "pros_1", name: "Bright Clinic" };

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "lead@desta.works", name: "Director", role } };
}

beforeEach(() => {
  h.session = null;
});

describe("ProspectsController — declared routes", () => {
  it("matches the Next.js route table it replaces, verb for verb and status for status", () => {
    const guards = ["CapabilityGuard"];
    const gate = { guards, capability: "viewClientDiscovery", rateLimit: null };
    expect(describeRoutes(ProspectsController)).toEqual([
      { route: "POST /prospects", ...gate, status: 201 },
      { route: "GET /prospects/list", ...gate, status: 200 },
      { route: "GET /prospects/search", ...gate, status: 200 },
      { route: "POST /prospects/bulk", ...gate, status: 200 },
      { route: "POST /prospects/bulk-add", ...gate, status: 200 },
      { route: "GET /prospects/:id", ...gate, status: 200 },
      { route: "PATCH /prospects/:id", ...gate, status: 200 },
      { route: "DELETE /prospects/:id", ...gate, status: 200 },
      { route: "POST /prospects/:id/contacts", ...gate, status: 201 },
      { route: "DELETE /prospects/:id/contacts/:contactId", ...gate, status: 200 },
      { route: "POST /prospects/:id/enrich", ...gate, status: 200 },
      { route: "POST /prospects/:id/enrich-hunter", ...gate, status: 200 },
      { route: "POST /prospects/:id/restore", ...gate, status: 200 },
    ]);
  });

  it("leaves no route in the area ungated — the class-level capability covers all thirteen", () => {
    const routes = describeRoutes(ProspectsController);
    expect(routes).toHaveLength(13);
    expect(routes.every((r) => r.capability === "viewClientDiscovery")).toBe(true);
  });

  it("declares the literal GET routes before GET /prospects/:id so neither is read as an id", () => {
    const paths = describeRoutes(ProspectsController).map((r) => r.route);
    const id = paths.indexOf("GET /prospects/:id");
    expect(paths.indexOf("GET /prospects/list")).toBeLessThan(id);
    expect(paths.indexOf("GET /prospects/search")).toBeLessThan(id);
  });
});

describe("ProspectsController — delegation and response envelope", () => {
  it("POST /prospects creates and returns the prospect envelope", async () => {
    const create = vi.fn().mockResolvedValue(PROSPECT);
    const body = { practiceName: "Bright Clinic" };

    expect(await controllerWith({ create }).create(body, USER)).toEqual({ prospect: PROSPECT });
    expect(create).toHaveBeenCalledWith(body, USER);
  });

  it("GET /prospects/list renames `deleted` to `includeDeleted` and drops absent filters", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });

    await controllerWith({ list }).list({ ownerId: "u2", deleted: true }, USER);

    expect(list).toHaveBeenCalledWith({ ownerId: "u2", includeDeleted: true }, USER);
  });

  it("GET /prospects/search returns the NPPES page unwrapped", async () => {
    const result = { results: [{ npi: "1", alreadyTracked: false }], resultCount: 1 };
    const search = vi.fn().mockResolvedValue(result);
    const query = { taxonomy: "Behavioral Health", state: "CT" as const };

    expect(await controllerWith({ search }).search(query, USER)).toEqual(result);
    expect(search).toHaveBeenCalledWith(query, USER);
  });

  it("POST /prospects/bulk returns the counts unwrapped", async () => {
    const bulkAction = vi.fn().mockResolvedValue({ affected: 2, skipped: 1 });
    const body = { ids: ["a"], action: "delete" as const };

    expect(await controllerWith({ bulkAction }).bulk(body, USER)).toEqual({
      affected: 2,
      skipped: 1,
    });
    expect(bulkAction).toHaveBeenCalledWith(body, USER);
  });

  it("POST /prospects/bulk-add returns the added/skipped counts unwrapped", async () => {
    const addFromSearch = vi.fn().mockResolvedValue({ added: 4, skipped: 0 });
    const body = { rows: [] };

    expect(await controllerWith({ addFromSearch }).bulkAdd(body, USER)).toEqual({
      added: 4,
      skipped: 0,
    });
    expect(addFromSearch).toHaveBeenCalledWith(body, USER);
  });

  it("GET /prospects/:id returns the prospect envelope", async () => {
    const detail = vi.fn().mockResolvedValue(PROSPECT);

    expect(await controllerWith({ detail }).detail("pros_1", USER)).toEqual({ prospect: PROSPECT });
    expect(detail).toHaveBeenCalledWith("pros_1", USER);
  });

  it("PATCH /prospects/:id passes the parsed body through", async () => {
    const update = vi.fn().mockResolvedValue(PROSPECT);
    const body = { status: "Contacted" as const };

    expect(await controllerWith({ update }).update("pros_1", body, USER)).toEqual({
      prospect: PROSPECT,
    });
    expect(update).toHaveBeenCalledWith("pros_1", body, USER);
  });

  it("DELETE /prospects/:id answers with the id alone — never the deleted prospect", async () => {
    const softDelete = vi.fn().mockResolvedValue({ id: "pros_1", name: "Bright Clinic" });

    const response = await controllerWith({ softDelete }).remove("pros_1", USER);

    expect(response).toEqual({ ok: true, id: "pros_1" });
    expect(JSON.stringify(response)).not.toContain("Bright Clinic");
  });

  it("POST /prospects/:id/contacts adds a contact and returns the fresh prospect", async () => {
    const addContactManual = vi.fn().mockResolvedValue(PROSPECT);
    const body = { fullName: "Dana Client" };

    expect(await controllerWith({ addContactManual }).addContact("pros_1", body, USER)).toEqual({
      prospect: PROSPECT,
    });
    expect(addContactManual).toHaveBeenCalledWith("pros_1", body, USER);
  });

  it("DELETE /prospects/:id/contacts/:contactId scopes the delete to both ids", async () => {
    const deleteContact = vi.fn().mockResolvedValue(PROSPECT);

    expect(await controllerWith({ deleteContact }).deleteContact("pros_1", "con_2", USER)).toEqual({
      prospect: PROSPECT,
    });
    expect(deleteContact).toHaveBeenCalledWith("pros_1", "con_2", USER);
  });

  it("POST /prospects/:id/enrich delegates to the Apollo path", async () => {
    const enrichContacts = vi.fn().mockResolvedValue(PROSPECT);

    expect(await controllerWith({ enrichContacts }).enrich("pros_1", USER)).toEqual({
      prospect: PROSPECT,
    });
    expect(enrichContacts).toHaveBeenCalledWith("pros_1", USER);
  });

  it("POST /prospects/:id/enrich-hunter delegates to the Hunter fallback, not Apollo", async () => {
    const findContactsHunter = vi.fn().mockResolvedValue(PROSPECT);
    const enrichContacts = vi.fn();

    await controllerWith({ findContactsHunter, enrichContacts }).enrichHunter("pros_1", USER);

    expect(findContactsHunter).toHaveBeenCalledWith("pros_1", USER);
    expect(enrichContacts).not.toHaveBeenCalled();
  });

  it("POST /prospects/:id/restore returns the prospect envelope", async () => {
    const restore = vi.fn().mockResolvedValue(PROSPECT);

    expect(await controllerWith({ restore }).restore("pros_1", USER)).toEqual({
      prospect: PROSPECT,
    });
    expect(restore).toHaveBeenCalledWith("pros_1", USER);
  });
});

describe("ProspectsController — authorization", () => {
  it("refuses an unauthenticated caller with 401 before the handler runs", async () => {
    const detail = vi.fn();

    await expect(
      throughGuards({
        controller: ProspectsController,
        method: "detail",
        guards: [new CapabilityGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ detail }).detail("pros_1", USER),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(detail).not.toHaveBeenCalled();
  });

  it("refuses a signed-in Screener with 403 — signed in is not the same as permitted", async () => {
    signInAs("Screener");
    const detail = vi.fn();

    await expect(
      throughGuards({
        controller: ProspectsController,
        method: "detail",
        guards: [new CapabilityGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ detail }).detail("pros_1", USER),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(detail).not.toHaveBeenCalled();
  });

  it("admits leadership", async () => {
    signInAs("Director");
    const detail = vi.fn().mockResolvedValue(PROSPECT);

    const response = await throughGuards({
      controller: ProspectsController,
      method: "detail",
      guards: [new CapabilityGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ detail }).detail("pros_1", USER),
    });

    expect(response).toEqual({ prospect: PROSPECT });
  });
});
