import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PipelineController` — `POST /pipeline/health`, ported from
 * `apps/web/src/app/api/pipeline/health`.
 *
 * The endpoint takes no body and answers 200 rather than Nest's default 201 for a POST: it is a
 * paid read dressed as a POST, and a 201 would tell a caller something was created.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  checkRateLimit: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({
  auth: { api: { getSession: async () => h.session } },
}));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/pipeline-health.service", () => ({ pipelineHealthService: {} }));
vi.mock("@destaworks/integrations/http/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));

import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { PipelineController } from "./pipeline.controller";
import type { AuthContext } from "@destaworks/auth/guards";

installNestRequestContext();

const actor: AuthContext = {
  tenantId: "t1",
  membershipId: "m1",
  user: { id: "u7", email: "op@desta.works", name: "Operator" },
  role: "Screener",
};

type PipelineHealthService = ConstructorParameters<typeof PipelineController>[0];

function controllerWith(methods: Partial<PipelineHealthService>): PipelineController {
  return new PipelineController(serviceStub<PipelineHealthService>(methods));
}

beforeEach(() => {
  h.session = null;
  h.checkRateLimit.mockReset();
});

describe("PipelineController — declared routes", () => {
  it("serves POST /pipeline/health at 200, session-guarded, ungated and rate limited", () => {
    expect(describeRoutes(PipelineController)).toEqual([
      {
        route: "POST /pipeline/health",
        guards: ["SessionAuthGuard", "RateLimitGuard"],
        capability: null,
        rateLimit: "pipeline-health",
        status: 200,
      },
    ]);
  });
});

describe("PipelineController — delegation", () => {
  it("returns the generated summary unwrapped and scopes it to the caller's tenant", async () => {
    const summary = {
      diagnostic: "Two candidates are overdue",
      healthScore: 62,
      topAction: "Call",
    };
    const generate = vi.fn().mockResolvedValue(summary);

    expect(await controllerWith({ generate }).health(actor)).toBe(summary);
    expect(generate).toHaveBeenCalledWith(actor);
  });
});

describe("PipelineController — authentication and rate limiting", () => {
  it("refuses an unauthenticated caller with 401 before the model is called", async () => {
    const generate = vi.fn();

    await expect(
      throughGuards({
        controller: PipelineController,
        method: "health",
        guards: [new SessionAuthGuard(), new RateLimitGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ generate }).health(actor),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(generate).not.toHaveBeenCalled();
    expect(h.checkRateLimit).not.toHaveBeenCalled();
  });

  it("spends the caller's own bucket, keyed exactly as the Next.js route keyed it", async () => {
    h.session = { user: { id: "u7", email: "op@desta.works", name: "Operator", role: "Screener" } };
    const generate = vi.fn().mockResolvedValue({});

    await throughGuards({
      controller: PipelineController,
      method: "health",
      guards: [new SessionAuthGuard(), new RateLimitGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ generate }).health(actor),
    });

    expect(h.checkRateLimit).toHaveBeenCalledWith("pipeline-health:u7", {
      limit: 20,
      windowMs: 60_000,
    });
  });
});
