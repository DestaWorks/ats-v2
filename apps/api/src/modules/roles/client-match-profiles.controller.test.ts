import "reflect-metadata";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

/**
 * Contract test for `/client-match-profiles/:clientId`: each handler driven through its own
 * declared guards, the handler, and the exception filter, against a mocked service.
 *
 * The leadership restriction on PUT/DELETE lives in `openRoleService`, not at the transport — so
 * the 403 case here goes through the SERVICE, which is what proves the controller did not quietly
 * drop the check by omitting a capability it was never supposed to declare.
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
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/open-role.service", () => ({ openRoleService: h.openRole }));

import { AppError } from "@destaworks/integrations/http/app-error";
import { openRoleService } from "@destaworks/application/open-role.service";
import type { AuthContext } from "@destaworks/auth/guards";
import {
  guardOutcome,
  handlerOutcome,
  routeSurface,
  type RouteSurface,
} from "../../common/testing/route-parity";
import { ClientMatchProfilesController } from "./client-match-profiles.controller";

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

interface EndpointCase {
  readonly name: string;
  readonly handler: string;
  readonly surface: RouteSurface;
  readonly spy: Mock;
  /** What the service resolves to, and — since every handler returns it unwrapped — the body. */
  readonly result: unknown;
  readonly viaController: (user: AuthContext) => Promise<unknown>;
}

const SESSION_ONLY: Pick<RouteSurface, "capability" | "guards"> = {
  capability: undefined,
  guards: ["SessionAuthGuard"],
};

const CASES: EndpointCase[] = [
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
    viaController: (user) => controller.read(CLIENT_ID, user),
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
    viaController: (user) => controller.reset(CLIENT_ID, user),
  },
];

function signIn(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role } };
}

async function authorize(handler: string): Promise<AuthContext> {
  const request: { headers: Record<string, string>; user?: AuthContext } = { headers: {} };
  expect(await guardOutcome(ClientMatchProfilesController, handler, request)).toBeNull();
  if (!request.user) throw new Error(`${handler}: guards attached no user`);
  return request.user;
}

beforeEach(() => {
  h.session = null;
  for (const spy of Object.values(h.openRole)) spy.mockReset();
});

describe.each(CASES)("$name", (testCase) => {
  it("is registered at the verb, path, status and gate the endpoint declares", () => {
    expect(routeSurface(ClientMatchProfilesController, testCase.handler)).toEqual(testCase.surface);
  });

  it("answers the service's profile at the declared status", async () => {
    signIn("Director");
    testCase.spy.mockResolvedValue(testCase.result);
    const user = await authorize(testCase.handler);
    const fromController = await handlerOutcome(
      ClientMatchProfilesController,
      testCase.handler,
      () => testCase.viaController(user),
    );

    expect(fromController.status).toBe(testCase.surface.status);
    expect(fromController.body).toEqual(testCase.result);
  });

  it("passes the service's leadership refusal through as a 403 envelope", async () => {
    signIn("Screener");
    const refuse = (): never => {
      throw new AppError("FORBIDDEN", "You don't have permission to do that");
    };
    testCase.spy.mockImplementation(refuse);

    const user = await authorize(testCase.handler);
    const fromController = await handlerOutcome(
      ClientMatchProfilesController,
      testCase.handler,
      () => testCase.viaController(user),
    );

    expect(fromController.status).toBe(403);
    expect(fromController.body).toEqual({
      error: { code: "FORBIDDEN", message: "You don't have permission to do that" },
    });
  });

  it("refuses an unauthenticated caller, without touching the service", async () => {
    const fromController = await guardOutcome(ClientMatchProfilesController, testCase.handler, {
      headers: {},
    });

    expect(fromController?.status).toBe(401);
    expect(fromController?.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Sign in required" },
    });
    expect(testCase.spy).not.toHaveBeenCalled();
  });
});
