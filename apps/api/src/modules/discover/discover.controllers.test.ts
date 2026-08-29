import "reflect-metadata";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import type { Type } from "@nestjs/common";

/**
 * Phase 4.3 contract test for `/discover/**` and `/saved-icps`: each ported route driven through
 * the NestJS controller and the Next.js route it replaces, with the same input against the same
 * mocked service, and the two `{ status, body }` results compared.
 *
 * The two areas share a file because they share a module and their gates differ in exactly the way
 * the table shows — the searches are open to any operator, the saved ICPs are not.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  discover: { addToSourcing: vi.fn(), supplyForCombo: vi.fn() },
  savedIcp: { list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/discover.service", () => ({ discoverService: h.discover }));
vi.mock("@destaworks/application/saved-icp.service", () => ({ savedIcpService: h.savedIcp }));

import { AppError } from "@destaworks/integrations/http/app-error";
import { discoverService } from "@destaworks/application/discover.service";
import { savedIcpService } from "@destaworks/application/saved-icp.service";
import type { AuthContext } from "@destaworks/auth/guards";
import {
  guardOutcome,
  handlerOutcome,
  routeOutcome,
  routeSurface,
  type RouteSurface,
} from "../../common/testing/route-parity";
import { DiscoverController } from "./discover.controller";
import { SavedIcpsController } from "./saved-icps.controller";
import { POST as addToSourcing } from "../../../../web/src/app/api/discover/add/route";
import { GET as coverageGapSupply } from "../../../../web/src/app/api/discover/coverage-gaps/supply/route";
import {
  GET as listSavedIcps,
  POST as createSavedIcp,
} from "../../../../web/src/app/api/saved-icps/route";
import { DELETE as deleteSavedIcp } from "../../../../web/src/app/api/saved-icps/[id]/route";

/** Holds `viewClientDiscovery`. */
const DIRECTOR = "Director";
/** Signed in, but not leadership — so no `viewClientDiscovery`. */
const ASSOCIATE = "Associate";

const discover = new DiscoverController(discoverService);
const savedIcps = new SavedIcpsController(savedIcpService);

const ICP_ID = "icp1";
const ADD_INPUT = { rows: [{ npi: "1234567893", name: "Dr. R. Alemu" }] };
const SUPPLY_QUERY = { credential: "PMHNP", state: "TX" } as const;
const ICP_INPUT = { name: "TX PMHNPs", state: "TX", isPrivate: false } as const;

const url = (path: string): string => `http://localhost/api${path}`;
const ctx = <P extends object>(params: P): { params: Promise<P> } => ({
  params: Promise.resolve(params),
});

interface ParityCase {
  readonly name: string;
  readonly controller: Type<object>;
  readonly handler: string;
  readonly surface: RouteSurface;
  readonly spy: Mock;
  readonly result: unknown;
  readonly viaRoute: () => Response | Promise<Response>;
  readonly viaController: (user: AuthContext) => Promise<unknown>;
  /** A signed-in role that lacks the route's capability, or `null` when it declares none. */
  readonly deniedRole: string | null;
}

const CASES: ParityCase[] = [
  {
    name: "POST /discover/add",
    controller: DiscoverController,
    handler: "addToSourcing",
    surface: {
      method: "POST",
      path: "/discover/add",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    },
    spy: h.discover.addToSourcing,
    result: { added: 1, skipped: 0 },
    viaRoute: () =>
      addToSourcing(
        new Request(url("/discover/add"), { method: "POST", body: JSON.stringify(ADD_INPUT) }),
        undefined,
      ),
    viaController: (user) => discover.addToSourcing(ADD_INPUT, user),
    deniedRole: null,
  },
  {
    name: "GET /discover/coverage-gaps/supply",
    controller: DiscoverController,
    handler: "coverageGapSupply",
    surface: {
      method: "GET",
      path: "/discover/coverage-gaps/supply",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    },
    spy: h.discover.supplyForCombo,
    result: { total: 42, sample: [] },
    viaRoute: () =>
      coverageGapSupply(
        new Request(url("/discover/coverage-gaps/supply?credential=PMHNP&state=TX")),
        undefined,
      ),
    viaController: (user) => discover.coverageGapSupply(SUPPLY_QUERY, user),
    deniedRole: null,
  },
  {
    name: "GET /saved-icps",
    controller: SavedIcpsController,
    handler: "list",
    surface: {
      method: "GET",
      path: "/saved-icps",
      status: 200,
      capability: "viewClientDiscovery",
      guards: ["SessionAuthGuard", "CapabilityGuard"],
    },
    spy: h.savedIcp.list,
    result: [{ id: ICP_ID, name: "TX PMHNPs" }],
    viaRoute: () => listSavedIcps(new Request(url("/saved-icps")), undefined),
    viaController: (user) => savedIcps.list(user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "POST /saved-icps",
    controller: SavedIcpsController,
    handler: "create",
    surface: {
      method: "POST",
      path: "/saved-icps",
      status: 201,
      capability: "viewClientDiscovery",
      guards: ["SessionAuthGuard", "CapabilityGuard"],
    },
    spy: h.savedIcp.create,
    result: { id: ICP_ID, name: "TX PMHNPs" },
    viaRoute: () =>
      createSavedIcp(
        new Request(url("/saved-icps"), { method: "POST", body: JSON.stringify(ICP_INPUT) }),
        undefined,
      ),
    viaController: (user) => savedIcps.create(ICP_INPUT, user),
    deniedRole: ASSOCIATE,
  },
  {
    name: "DELETE /saved-icps/:id",
    controller: SavedIcpsController,
    handler: "remove",
    surface: {
      method: "DELETE",
      path: "/saved-icps/:id",
      status: 200,
      capability: "viewClientDiscovery",
      guards: ["SessionAuthGuard", "CapabilityGuard"],
    },
    spy: h.savedIcp.remove,
    result: { id: ICP_ID },
    viaRoute: () =>
      deleteSavedIcp(new Request(url(`/saved-icps/${ICP_ID}`), { method: "DELETE" }), {
        ...ctx({ id: ICP_ID }),
      }),
    viaController: (user) => savedIcps.remove(ICP_ID, user),
    deniedRole: ASSOCIATE,
  },
];

function signIn(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role } };
}

async function authorize(testCase: ParityCase): Promise<AuthContext> {
  const request: { headers: Record<string, string>; user?: AuthContext } = { headers: {} };
  expect(await guardOutcome(testCase.controller, testCase.handler, request)).toBeNull();
  if (!request.user) throw new Error(`${testCase.name}: guards attached no user`);
  return request.user;
}

beforeEach(() => {
  h.session = null;
  for (const group of [h.discover, h.savedIcp]) {
    for (const spy of Object.values(group)) spy.mockReset();
  }
});

describe.each(CASES)("$name", (testCase) => {
  it("is registered at the verb, path, status and capability the Next route enforces", () => {
    expect(routeSurface(testCase.controller, testCase.handler)).toEqual(testCase.surface);
  });

  it("answers the same body and status as the Next route", async () => {
    signIn(DIRECTOR);
    testCase.spy.mockResolvedValue(testCase.result);
    const fromRoute = await routeOutcome(await testCase.viaRoute());

    testCase.spy.mockResolvedValue(testCase.result);
    const user = await authorize(testCase);
    const fromController = await handlerOutcome(testCase.controller, testCase.handler, () =>
      testCase.viaController(user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(testCase.surface.status);
  });

  it("maps a service failure to the same envelope", async () => {
    signIn(DIRECTOR);
    const reject = (): never => {
      throw new AppError("NOT_FOUND", "Saved ICP not found");
    };
    testCase.spy.mockImplementation(reject);
    const fromRoute = await routeOutcome(await testCase.viaRoute());

    const user = await authorize(testCase);
    const fromController = await handlerOutcome(testCase.controller, testCase.handler, () =>
      testCase.viaController(user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(404);
  });

  it("refuses an unauthenticated caller with the same envelope, without touching the service", async () => {
    const fromRoute = await routeOutcome(await testCase.viaRoute());
    const fromController = await guardOutcome(testCase.controller, testCase.handler, {
      headers: {},
    });

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(401);
    expect(testCase.spy).not.toHaveBeenCalled();
  });
});

describe.each(CASES.filter((c) => c.deniedRole !== null))("$name — capability", (testCase) => {
  it("refuses a role without the capability with the same envelope", async () => {
    signIn(testCase.deniedRole ?? ASSOCIATE);
    const fromRoute = await routeOutcome(await testCase.viaRoute());
    const fromController = await guardOutcome(testCase.controller, testCase.handler, {
      headers: {},
    });

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(403);
    expect(testCase.spy).not.toHaveBeenCalled();
  });
});
