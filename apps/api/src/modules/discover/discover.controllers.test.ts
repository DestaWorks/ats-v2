import "reflect-metadata";
import { describe, it, expect, afterAll, beforeAll, beforeEach, vi, type Mock } from "vitest";
import type { Type } from "@nestjs/common";

/**
 * Phase 4.3 contract test for `/discover/**` and `/saved-icps`: each ported route driven through
 * the NestJS controller and the Next.js route it replaces, with the same input against the same
 * mocked service, and the two `{ status, body }` results compared.
 *
 * The two areas share a file because they share a module and their gates differ in exactly the way
 * the table shows — the searches are open to any operator, the saved ICPs are not.
 *
 * `GET /discover/search` and `GET /discover/coverage-gaps` have no Next.js counterpart to compare
 * against — the `/discover` page read them in-process — so they are driven over a real socket at
 * the bottom of this file instead, which is the only way to exercise the query pipe and the
 * envelope the filter renders for a rejected query.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  discover: {
    addToSourcing: vi.fn(),
    supplyForCombo: vi.fn(),
    search: vi.fn(),
    coverageGaps: vi.fn(),
  },
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
import { provideFakeService, startTestApi, type TestApi } from "../../common/testing/nest-app";
import { DiscoverController } from "./discover.controller";
import { SavedIcpsController } from "./saved-icps.controller";
import { DISCOVER_SERVICE } from "./discover.tokens";
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

/**
 * The two reads the `/discover` page used to make in-process. No Next.js route ever served them,
 * so there is nothing to compare against — what these assert instead is the surface the page now
 * depends on: the gate, the contract that validates the query, and the delegation.
 */
describe("the /discover page reads", () => {
  const SEARCH_RESULT = {
    results: [
      {
        npi: "1234567893",
        firstName: "R",
        lastName: "Alemu",
        credential: "PMHNP",
        city: "Austin",
        state: "TX",
        phone: null,
        taxonomyDesc: null,
        licenseNumber: null,
        licenseState: "TX",
        dupStatus: "new",
        dupMatchId: null,
        dupMatchLabel: null,
      },
    ],
    resultCount: 1,
  };
  const GAP_ROWS = [
    { credential: "PMHNP", state: "TX", roleCount: 4, poolCount: 2, pipelineCount: 1 },
  ];

  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi({
      controllers: [DiscoverController],
      providers: [
        provideFakeService(DISCOVER_SERVICE, {
          search: h.discover.search,
          coverageGaps: h.discover.coverageGaps,
        }),
      ],
    });
  });

  afterAll(() => api.close());

  describe("GET /discover/search", () => {
    it("is registered at the verb, path, status and gate the page enforced", () => {
      expect(routeSurface(DiscoverController, "search")).toEqual({
        method: "GET",
        path: "/discover/search",
        status: 200,
        capability: undefined,
        guards: ["SessionAuthGuard"],
      });
    });

    it("401 when signed out, and never reaches the service", async () => {
      const res = await api.fetch("/discover/search?state=TX&city=Austin");
      expect(res.status).toBe(401);
      expect(h.discover.search).not.toHaveBeenCalled();
    });

    it("passes the validated query and the resolved context through", async () => {
      signIn(ASSOCIATE);
      h.discover.search.mockResolvedValue(SEARCH_RESULT);
      const res = await api.fetch("/discover/search?state=TX&city=Austin&sneaky=1");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(SEARCH_RESULT);
      expect(h.discover.search).toHaveBeenCalledWith(
        { state: "TX", city: "Austin" },
        expect.objectContaining({
          tenantId: expect.any(String),
          user: expect.objectContaining({ id: "u1" }),
        }),
      );
    });

    it("422s a query NPPES itself refuses, without calling out to it", async () => {
      signIn(ASSOCIATE);
      const res = await api.fetch("/discover/search?state=TX");
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(h.discover.search).not.toHaveBeenCalled();
    });

    it("422s a value outside the contract's vocabulary", async () => {
      signIn(ASSOCIATE);
      const res = await api.fetch("/discover/search?state=XX&city=Austin");
      expect(res.status).toBe(422);
      expect(h.discover.search).not.toHaveBeenCalled();
    });

    it("reads a repeated key the way the page's own parse did — the first value", async () => {
      signIn(ASSOCIATE);
      h.discover.search.mockResolvedValue(SEARCH_RESULT);
      await api.fetch("/discover/search?city=Austin&city=Dallas");
      expect(h.discover.search).toHaveBeenCalledWith(
        { city: "Austin" },
        expect.objectContaining({ tenantId: expect.any(String) }),
      );
    });
  });

  describe("GET /discover/coverage-gaps", () => {
    it("is registered at the verb, path, status and gate the page enforced", () => {
      expect(routeSurface(DiscoverController, "coverageGaps")).toEqual({
        method: "GET",
        path: "/discover/coverage-gaps",
        status: 200,
        capability: undefined,
        guards: ["SessionAuthGuard"],
      });
    });

    it("401 when signed out, and never reaches the service", async () => {
      const res = await api.fetch("/discover/coverage-gaps");
      expect(res.status).toBe(401);
      expect(h.discover.coverageGaps).not.toHaveBeenCalled();
    });

    it("answers the widget's rows for the resolved tenant, taking no parameters", async () => {
      signIn(ASSOCIATE);
      h.discover.coverageGaps.mockResolvedValue(GAP_ROWS);
      const res = await api.fetch("/discover/coverage-gaps?credential=PMHNP");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(GAP_ROWS);
      expect(h.discover.coverageGaps).toHaveBeenCalledTimes(1);
      expect(h.discover.coverageGaps.mock.calls[0]).toHaveLength(1);
    });

    it("does not collide with the per-combo supply lookup below it", async () => {
      signIn(ASSOCIATE);
      h.discover.coverageGaps.mockResolvedValue(GAP_ROWS);
      await api.fetch("/discover/coverage-gaps");
      expect(h.discover.supplyForCombo).not.toHaveBeenCalled();
    });
  });
});
