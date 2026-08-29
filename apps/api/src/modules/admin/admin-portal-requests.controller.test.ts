import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for the three `/api/admin/portal/requests*` routes against the Next.js handlers
 * they replace.
 *
 * The gate here is `configureClientPortal`, NOT `manageUsers` — approving mints a portal link for
 * an EXTERNAL client contact, which is a different grant from creating an operator account, and
 * the declared capability is asserted per route so the two cannot be conflated during the cutover.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  list: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/portal-access-request.service", () => ({
  portalAccessRequestService: h,
}));
vi.mock("@destaworks/application/client-portal.service", () => ({ clientPortalService: {} }));

import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthContext } from "@destaworks/auth/guards";
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
import { PORTAL_ACCESS_REQUEST_SERVICE } from "../portal/portal.module";
import { AdminPortalRequestsController } from "./admin-portal-requests.controller";

installNestRequestContext();

const REQUEST_ROW = {
  id: "p1",
  name: "Dana",
  email: "dana@client.example",
  requestedClientName: "Client Co",
  note: null,
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const HANDLERS = ["list", "approve", "decline"] as const;

const controller = (): AdminPortalRequestsController =>
  new AdminPortalRequestsController({
    list: h.list,
    approve: h.approve,
    decline: h.decline,
    submit: vi.fn(),
  });

async function admitted(handlerName: string): Promise<AuthContext> {
  h.session = { user: { id: "owner1", email: "o@desta.works", name: "O", role: "Owner" } };
  const request: AuthenticatedRequest = { headers: {} };
  await runDeclaredGuards(AdminPortalRequestsController, handlerName, request);
  const { user } = request;
  if (!user) throw new Error("the guard chain admitted the request without attaching a user");
  return user;
}

function denyingAs(role: string | null, handlerName: string): Promise<unknown> {
  h.session =
    role === null ? null : { user: { id: "d1", email: "d@desta.works", name: "D", role } };
  return renderFailure(() =>
    runDeclaredGuards(AdminPortalRequestsController, handlerName, {
      headers: {},
    } as AuthenticatedRequest),
  );
}

beforeEach(() => {
  h.session = null;
  h.list.mockReset();
  h.approve.mockReset();
  h.decline.mockReset();
});

describe("the admin portal-request routes keep the Next.js verbs, paths and statuses", () => {
  it("mounts the queue and both transitions where their routes were", () => {
    expect(routeOf(AdminPortalRequestsController, "list")).toMatchObject({
      method: "GET",
      path: "/admin/portal/requests",
      status: 200,
    });
    expect(routeOf(AdminPortalRequestsController, "approve")).toMatchObject({
      method: "POST",
      path: "/admin/portal/requests/:id/approve",
      status: 200,
    });
    expect(routeOf(AdminPortalRequestsController, "decline")).toMatchObject({
      method: "POST",
      path: "/admin/portal/requests/:id/decline",
      status: 200,
    });
  });

  it("injects the portal service by the token PortalModule exports — not a second registration", () => {
    expect(injectedTokens(AdminPortalRequestsController)).toEqual([PORTAL_ACCESS_REQUEST_SERVICE]);
  });
});

describe("authorization", () => {
  it("gates all three on configureClientPortal", () => {
    for (const handler of HANDLERS) {
      expect(routeOf(AdminPortalRequestsController, handler)).toMatchObject({
        capability: "configureClientPortal",
        guards: ["SessionAuthGuard", "CapabilityGuard"],
      });
    }
  });

  it("401s all three signed out and 403s all three for a role without the capability", async () => {
    for (const handler of HANDLERS) {
      expect(await denyingAs(null, handler), handler).toEqual({
        status: 401,
        body: { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
      });
      expect(await denyingAs("Director", handler), handler).toEqual({
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "You don't have permission to do that" } },
      });
    }
    expect(h.list).not.toHaveBeenCalled();
    expect(h.approve).not.toHaveBeenCalled();
    expect(h.decline).not.toHaveBeenCalled();
  });
});

describe("the queue and its transitions", () => {
  it("lists every submitted request under the route's own key", async () => {
    h.list.mockResolvedValue([REQUEST_ROW]);
    expect(await controller().list()).toEqual({ requests: [REQUEST_ROW] });
  });

  it("approves with the parsed body and the session actor, returning the generated link", async () => {
    const link = { contact: { id: "c1" }, token: "tok" };
    h.approve.mockResolvedValue(link);
    const actor = await admitted("approve");
    expect(await controller().approve(actor, "p1", { clientId: "cl1" })).toEqual(link);
    expect(h.approve).toHaveBeenCalledWith("p1", { clientId: "cl1" }, actor);
  });

  it("validates the approve body with the contract schema — a missing clientId is 422", async () => {
    const [pipe] = boundPipes(AdminPortalRequestsController, "approve");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(await renderFailure(() => pipe?.transform({}))).toMatchObject({
      status: 422,
      body: { error: { code: "BAD_REQUEST", message: "Validation failed" } },
    });
  });

  it("declines and acknowledges the id", async () => {
    h.decline.mockResolvedValue(undefined);
    expect(await controller().decline("p1")).toEqual({ ok: true, id: "p1" });
    expect(h.decline).toHaveBeenCalledWith("p1");
  });

  it("carries an unknown request through as the route's 404 envelope", async () => {
    h.approve.mockRejectedValue(new AppError("NOT_FOUND", "Request not found"));
    const actor = await admitted("approve");
    expect(
      await renderFailure(() => controller().approve(actor, "gone", { clientId: "cl1" })),
    ).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Request not found" } },
    });
  });
});
