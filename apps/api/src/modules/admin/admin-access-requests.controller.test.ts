import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for the three `/api/admin/access-requests*` routes against the Next.js handlers
 * they replace. Approving creates an operator account with a chosen role, so all three carry
 * `manageAccessRequests` and every one of them is asserted to refuse both an unauthenticated
 * caller and an authenticated role that does not hold it.
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
vi.mock("@destaworks/application/access-request.service", () => ({ accessRequestService: h }));
vi.mock("@destaworks/application/admin-user.service", () => ({ adminUserService: {} }));
vi.mock("@destaworks/application/ai-ops.service", () => ({ aiOpsService: {} }));

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
import { ACCESS_REQUEST_SERVICE } from "./admin.tokens";
import { AdminAccessRequestsController } from "./admin-access-requests.controller";

installNestRequestContext();

const REQUEST_ROW = {
  id: "r1",
  name: "Jane",
  email: "jane@desta.works",
  organization: null,
  message: null,
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const HANDLERS = ["list", "approve", "decline"] as const;

const controller = (): AdminAccessRequestsController =>
  new AdminAccessRequestsController({
    list: h.list,
    approve: h.approve,
    decline: h.decline,
    submit: vi.fn(),
  });

async function admitted(handlerName: string): Promise<AuthContext> {
  h.session = { user: { id: "owner1", email: "o@desta.works", name: "O", role: "Owner" } };
  const request: AuthenticatedRequest = { headers: {} };
  await runDeclaredGuards(AdminAccessRequestsController, handlerName, request);
  const { user } = request;
  if (!user) throw new Error("the guard chain admitted the request without attaching a user");
  return user;
}

function denyingAs(role: string | null, handlerName: string): Promise<unknown> {
  h.session =
    role === null ? null : { user: { id: "d1", email: "d@desta.works", name: "D", role } };
  return renderFailure(() =>
    runDeclaredGuards(AdminAccessRequestsController, handlerName, {
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

const ACTOR = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "owner1", email: "o@desta.works", name: "Owner" },
} as never;

describe("the access-request routes keep the Next.js verbs, paths and statuses", () => {
  it("mounts the queue and both transitions where their routes were", () => {
    expect(routeOf(AdminAccessRequestsController, "list")).toMatchObject({
      method: "GET",
      path: "/admin/access-requests",
      status: 200,
    });
    expect(routeOf(AdminAccessRequestsController, "approve")).toMatchObject({
      method: "POST",
      path: "/admin/access-requests/:id/approve",
      status: 200,
    });
    expect(routeOf(AdminAccessRequestsController, "decline")).toMatchObject({
      method: "POST",
      path: "/admin/access-requests/:id/decline",
      status: 200,
    });
  });

  it("injects the access-request service by token — never the imported singleton", () => {
    expect(injectedTokens(AdminAccessRequestsController)).toEqual([ACCESS_REQUEST_SERVICE]);
  });
});

describe("authorization", () => {
  it("gates all three on manageAccessRequests", () => {
    for (const handler of HANDLERS) {
      expect(routeOf(AdminAccessRequestsController, handler)).toMatchObject({
        capability: "manageAccessRequests",
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
      expect(await denyingAs("Manager", handler), handler).toEqual({
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
    expect(await controller().list(ACTOR)).toEqual({ requests: [REQUEST_ROW] });
  });

  it("approves with the chosen role, attributed to the session actor", async () => {
    h.approve.mockResolvedValue({ user: { id: "u9" }, generatedPassword: "pw" });
    const actor = await admitted("approve");
    expect(await controller().approve(actor, "r1", { role: "Screener" })).toEqual({
      user: { id: "u9" },
      generatedPassword: "pw",
    });
    expect(h.approve).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "owner1" }) }),
      "r1",
      "Screener",
    );
  });

  it("validates the approve body with the contract schema — an unknown role is 422", async () => {
    const [pipe] = boundPipes(AdminAccessRequestsController, "approve");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(await renderFailure(() => pipe?.transform({ role: "Wizard" }))).toMatchObject({
      status: 422,
      body: { error: { code: "BAD_REQUEST", message: "Validation failed" } },
    });
  });

  it("declines and acknowledges the id", async () => {
    h.decline.mockResolvedValue(undefined);
    expect(await controller().decline(ACTOR, "r1")).toEqual({ ok: true, id: "r1" });
    expect(h.decline).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.any(String) }),
      "r1",
    );
  });

  it("carries an unknown request through as the route's 404 envelope", async () => {
    h.decline.mockRejectedValue(new AppError("NOT_FOUND", "Request not found"));
    expect(await renderFailure(() => controller().decline(ACTOR, "gone"))).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Request not found" } },
    });
  });
});
