import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Contract parity for `GET /alerts` against `apps/web/src/app/api/alerts/route.ts`.
 *
 * The bell polls this, so the two things worth proving are that the composite body is passed
 * through unchanged and that the viewer it is scoped to is the session — the legacy backend let
 * a caller name the recipient, and this is the route where that must not come back.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  forViewer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/alert.service", () => ({
  alertService: { forViewer: h.forViewer },
}));

import { AppError } from "@destaworks/integrations/http/app-error";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import type { AuthenticatedRequest } from "../../common/guards/authenticated-request";
import {
  injectedTokens,
  renderFailure,
  routeOf,
  runDeclaredGuards,
} from "../../common/testing/route-parity";
import { ALERT_SERVICE } from "./alerts.tokens";
import { AlertsController } from "./alerts.controller";

installNestRequestContext();

const ALERTS = {
  mentions: [],
  unread: 0,
  overdue: [],
  newToReview: [],
  verificationPending: [],
};

const controller = (): AlertsController => new AlertsController({ forViewer: h.forViewer });

beforeEach(() => {
  h.session = null;
  h.forViewer.mockReset();
});

describe("GET /alerts", () => {
  it("keeps the Next.js verb, path and status, and requires only a session", () => {
    expect(routeOf(AlertsController, "forViewer")).toEqual({
      method: "GET",
      path: "/alerts",
      status: 200,
      capability: undefined,
      guards: ["SessionAuthGuard"],
    });
  });

  it("injects the alert service by token — never the imported singleton", () => {
    expect(injectedTokens(AlertsController)).toEqual([ALERT_SERVICE]);
  });

  it("returns the composite unchanged, scoped to the session user", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const request: AuthenticatedRequest = { headers: {} };
    await runDeclaredGuards(AlertsController, "forViewer", request);
    const { user } = request;
    if (!user) throw new Error("the guard admitted the request without attaching a user");

    h.forViewer.mockResolvedValue(ALERTS);
    expect(await controller().forViewer(user)).toEqual(ALERTS);
    expect(h.forViewer).toHaveBeenCalledWith(user);
  });

  it("401s signed out, with the same envelope the Next.js route returns", async () => {
    expect(
      await renderFailure(() =>
        runDeclaredGuards(AlertsController, "forViewer", { headers: {} } as AuthenticatedRequest),
      ),
    ).toEqual({
      status: 401,
      body: { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
    });
    expect(h.forViewer).not.toHaveBeenCalled();
  });

  it("carries a service failure through as the route's own envelope", async () => {
    h.forViewer.mockRejectedValue(new AppError("NOT_FOUND", "Viewer not found"));
    expect(
      await renderFailure(() =>
        controller().forViewer({
          tenantId: "t1",
          membershipId: "u1-m",
          user: { id: "u1", email: "a@desta.works", name: "A" },
          role: "Associate",
        }),
      ),
    ).toEqual({ status: 404, body: { error: { code: "NOT_FOUND", message: "Viewer not found" } } });
  });
});
