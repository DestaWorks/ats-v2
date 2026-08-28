import "reflect-metadata";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

/**
 * Phase 4.3 contract test for `/client-match-profiles/:clientId`: the NestJS controller and the
 * Next.js route it replaces, driven with the same input against the same mocked service.
 *
 * The leadership restriction on PUT/DELETE lives in `openRoleService`, not at the transport — so
 * the 403 case here goes through the SERVICE, and its parity is what proves the controller did not
 * quietly drop the check by omitting a capability it was never supposed to declare.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  openRole: { getMatchProfile: vi.fn(), saveMatchProfile: vi.fn(), deleteMatchProfile: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/open-role.service", () => ({ openRoleService: h.openRole }));

import { AppError } from "@destaworks/integrations/http/app-error";
import { openRoleService } from "@destaworks/application/open-role.service";
import type { AuthUser } from "@destaworks/auth/guards";
import {
  guardOutcome,
  handlerOutcome,
  routeOutcome,
  routeSurface,
  type RouteSurface,
} from "../../common/testing/route-parity";
import { ClientMatchProfilesController } from "./client-match-profiles.controller";
import {
  GET as readProfile,
  PUT as saveProfile,
  DELETE as resetProfile,
} from "../../../../web/src/app/api/client-match-profiles/[clientId]/route";

const CLIENT_ID = "cli1";

const WEIGHTS = {
  weightSameClient: 30,
  weightSameState: 20,
  weightCredExact: 25,
  weightCredPartial: 10,
  weightRespondedHot: 15,
  weightOutreach: 5,
  weightSourced: 2,
  penaltyCold: 5,
  minScore: 40,
} as const;

const PROFILE = { clientId: CLIENT_ID, isDefault: false, ...WEIGHTS };

const controller = new ClientMatchProfilesController(openRoleService);

const url = `http://localhost/api/client-match-profiles/${CLIENT_ID}`;
const freshCtx = (): { params: Promise<{ clientId: string }> } => ({
  params: Promise.resolve({ clientId: CLIENT_ID }),
});

interface ParityCase {
  readonly name: string;
  readonly handler: string;
  readonly surface: RouteSurface;
  readonly spy: Mock;
  readonly result: unknown;
  readonly viaRoute: () => Response | Promise<Response>;
  readonly viaController: (user: AuthUser) => Promise<unknown>;
}

const SESSION_ONLY: Pick<RouteSurface, "capability" | "guards"> = {
  capability: undefined,
  guards: ["SessionAuthGuard"],
};

const CASES: ParityCase[] = [
  {
    name: "GET /client-match-profiles/:clientId",
    handler: "read",
    surface: {
      method: "GET",
      path: "/client-match-profiles/:clientId",
      status: 200,
      ...SESSION_ONLY,
    },
    spy: h.openRole.getMatchProfile,
    result: PROFILE,
    viaRoute: () => readProfile(new Request(url), freshCtx()),
    viaController: () => controller.read(CLIENT_ID),
  },
  {
    name: "PUT /client-match-profiles/:clientId",
    handler: "save",
    surface: {
      method: "PUT",
      path: "/client-match-profiles/:clientId",
      status: 200,
      ...SESSION_ONLY,
    },
    spy: h.openRole.saveMatchProfile,
    result: PROFILE,
    viaRoute: () =>
      saveProfile(new Request(url, { method: "PUT", body: JSON.stringify(WEIGHTS) }), freshCtx()),
    viaController: (user) => controller.save(CLIENT_ID, WEIGHTS, user),
  },
  {
    name: "DELETE /client-match-profiles/:clientId",
    handler: "reset",
    surface: {
      method: "DELETE",
      path: "/client-match-profiles/:clientId",
      status: 200,
      ...SESSION_ONLY,
    },
    spy: h.openRole.deleteMatchProfile,
    result: { ...PROFILE, isDefault: true },
    viaRoute: () => resetProfile(new Request(url, { method: "DELETE" }), freshCtx()),
    viaController: (user) => controller.reset(CLIENT_ID, user),
  },
];

function signIn(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role } };
}

async function authorize(handler: string): Promise<AuthUser> {
  const request: { headers: Record<string, string>; user?: AuthUser } = { headers: {} };
  expect(await guardOutcome(ClientMatchProfilesController, handler, request)).toBeNull();
  if (!request.user) throw new Error(`${handler}: guards attached no user`);
  return request.user;
}

beforeEach(() => {
  h.session = null;
  for (const spy of Object.values(h.openRole)) spy.mockReset();
});

describe.each(CASES)("$name", (testCase) => {
  it("is registered at the verb, path, status and gate the Next route enforces", () => {
    expect(routeSurface(ClientMatchProfilesController, testCase.handler)).toEqual(testCase.surface);
  });

  it("answers the same body and status as the Next route", async () => {
    signIn("Director");
    testCase.spy.mockResolvedValue(testCase.result);
    const fromRoute = await routeOutcome(await testCase.viaRoute());

    testCase.spy.mockResolvedValue(testCase.result);
    const user = await authorize(testCase.handler);
    const fromController = await handlerOutcome(
      ClientMatchProfilesController,
      testCase.handler,
      () => testCase.viaController(user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(testCase.surface.status);
  });

  it("passes the service's leadership refusal through as the same 403 envelope", async () => {
    signIn("Screener");
    const refuse = (): never => {
      throw new AppError("FORBIDDEN", "You don't have permission to do that");
    };
    testCase.spy.mockImplementation(refuse);
    const fromRoute = await routeOutcome(await testCase.viaRoute());

    const user = await authorize(testCase.handler);
    const fromController = await handlerOutcome(
      ClientMatchProfilesController,
      testCase.handler,
      () => testCase.viaController(user),
    );

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(403);
  });

  it("refuses an unauthenticated caller with the same envelope, without touching the service", async () => {
    const fromRoute = await routeOutcome(await testCase.viaRoute());
    const fromController = await guardOutcome(ClientMatchProfilesController, testCase.handler, {
      headers: {},
    });

    expect(fromController).toEqual(fromRoute);
    expect(fromRoute.status).toBe(401);
    expect(testCase.spy).not.toHaveBeenCalled();
  });
});
