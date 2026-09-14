import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for the three `/api/admin/ai/*` routes against the Next.js handlers they
 * replace. All three are `manageAiSettings`: the kill switch, and the spend that justifies
 * flipping it.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  getSettings: vi.fn(),
  setDisabled: vi.fn(),
  getUsageOverview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/ai-ops.service", () => ({ aiOpsService: h }));
vi.mock("@destaworks/application/admin-user.service", () => ({ adminUserService: {} }));
vi.mock("@destaworks/application/access-request.service", () => ({ accessRequestService: {} }));

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
import { AI_OPS_SERVICE } from "./admin.tokens";
import { AdminAiController } from "./admin-ai.controller";

installNestRequestContext();

const SETTINGS = { disabled: false, reason: null, updatedAt: "2026-01-01T00:00:00.000Z" };
const HANDLERS = ["getSettings", "setSettings", "getUsage"] as const;

const controller = (): AdminAiController =>
  new AdminAiController({
    getSettings: h.getSettings,
    setDisabled: h.setDisabled,
    getUsageOverview: h.getUsageOverview,
  });

async function admitted(handlerName: string): Promise<AuthContext> {
  h.session = { user: { id: "owner1", email: "o@desta.works", name: "O", role: "Owner" } };
  const request: AuthenticatedRequest = { headers: {} };
  await runDeclaredGuards(AdminAiController, handlerName, request);
  const { user } = request;
  if (!user) throw new Error("the guard chain admitted the request without attaching a user");
  return user;
}

function denyingAs(role: string | null, handlerName: string): Promise<unknown> {
  h.session =
    role === null ? null : { user: { id: "d1", email: "d@desta.works", name: "D", role } };
  return renderFailure(() =>
    runDeclaredGuards(AdminAiController, handlerName, { headers: {} } as AuthenticatedRequest),
  );
}

beforeEach(() => {
  h.session = null;
  h.getSettings.mockReset();
  h.setDisabled.mockReset();
  h.getUsageOverview.mockReset();
});

describe("the AI ops routes keep the Next.js verbs, paths and gate", () => {
  it("mounts settings and usage where their routes were", () => {
    expect(routeOf(AdminAiController, "getSettings")).toMatchObject({
      method: "GET",
      path: "/admin/ai/settings",
      status: 200,
    });
    expect(routeOf(AdminAiController, "setSettings")).toMatchObject({
      method: "PATCH",
      path: "/admin/ai/settings",
      status: 200,
    });
    expect(routeOf(AdminAiController, "getUsage")).toMatchObject({
      method: "GET",
      path: "/admin/ai/usage",
      status: 200,
    });
  });

  it("gates all three on manageAiSettings", () => {
    for (const handler of HANDLERS) {
      expect(routeOf(AdminAiController, handler)).toMatchObject({
        capability: "manageAiSettings",
        guards: ["SessionAuthGuard", "CapabilityGuard"],
      });
    }
  });

  it("injects the AI ops service by token — never the imported singleton", () => {
    expect(injectedTokens(AdminAiController)).toEqual([AI_OPS_SERVICE]);
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
    expect(h.getSettings).not.toHaveBeenCalled();
    expect(h.setDisabled).not.toHaveBeenCalled();
    expect(h.getUsageOverview).not.toHaveBeenCalled();
  });
});

describe("the kill switch and the spend behind it", () => {
  it("reads the current settings", async () => {
    h.getSettings.mockResolvedValue(SETTINGS);
    const actor = await admitted("getSettings");
    expect(await controller().getSettings(actor)).toEqual(SETTINGS);
  });

  it("flips the switch with the session actor and the supplied reason", async () => {
    h.setDisabled.mockResolvedValue({ ...SETTINGS, disabled: true, reason: "cost" });
    const actor = await admitted("setSettings");
    expect(await controller().setSettings(actor, { disabled: true, reason: "cost" })).toEqual({
      ...SETTINGS,
      disabled: true,
      reason: "cost",
    });
    expect(h.setDisabled).toHaveBeenCalledWith(actor, true, "cost");
  });

  it("validates the settings body with the contract schema, answering 422 + issues", async () => {
    const [pipe] = boundPipes(AdminAiController, "setSettings");
    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(await renderFailure(() => pipe?.transform({ disabled: "yes" }))).toMatchObject({
      status: 422,
      body: { error: { code: "BAD_REQUEST", message: "Validation failed" } },
    });
  });

  it("returns the usage overview", async () => {
    h.getUsageOverview.mockResolvedValue({ totals: {}, byFeature: [] });
    const actor = await admitted("getUsage");
    expect(await controller().getUsage(actor)).toEqual({
      totals: {},
      byFeature: [],
    });
  });

  it("carries a service failure through as the route's own envelope", async () => {
    h.getUsageOverview.mockRejectedValue(new AppError("UPSTREAM_ERROR", "Usage store unavailable"));
    const actor = await admitted("getUsage");
    expect(await renderFailure(() => controller().getUsage(actor))).toMatchObject({
      body: { error: { code: "UPSTREAM_ERROR", message: "Usage store unavailable" } },
    });
  });
});
