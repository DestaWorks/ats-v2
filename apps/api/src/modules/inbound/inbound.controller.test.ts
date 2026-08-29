import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `InboundController` — the three endpoints ported from `apps/web/src/app/api/inbound/**`.
 *
 * The rate limit is the detail worth pinning: the Next.js route built the key
 * `inbound-triage:${user.id}` by hand, so the ported bucket name has to be the SAME string or the
 * two surfaces count against different buckets and the paid-call budget silently doubles during
 * the cutover. It is asserted here, not just declared.
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
vi.mock("@destaworks/application/inbound.service", () => ({ inboundService: {} }));
vi.mock("@destaworks/integrations/http/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));

import type { AuthContext } from "@destaworks/auth/guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { InboundController } from "./inbound.controller";

installNestRequestContext();

type InboundService = ConstructorParameters<typeof InboundController>[0];

function controllerWith(methods: Partial<InboundService>): InboundController {
  return new InboundController(serviceStub<InboundService>(methods));
}

const USER: AuthContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "op@desta.works", name: "Operator" },
  role: "Associate",
};
const LEAD = { id: "lead_1", name: "A. Bekele" };

beforeEach(() => {
  h.session = null;
  h.checkRateLimit.mockReset();
});

describe("InboundController — declared routes", () => {
  it("matches the Next.js route table, including which endpoint is rate limited", () => {
    const session = ["SessionAuthGuard"];
    expect(describeRoutes(InboundController)).toEqual([
      {
        route: "POST /inbound/triage",
        guards: [...session, "RateLimitGuard"],
        capability: null,
        rateLimit: "inbound-triage",
        status: 200,
      },
      {
        route: "POST /inbound/attach",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 200,
      },
      {
        route: "POST /inbound/save",
        guards: session,
        capability: null,
        rateLimit: null,
        status: 201,
      },
    ]);
  });
});

describe("InboundController — delegation and response envelope", () => {
  it("POST /inbound/triage returns the extraction unwrapped and creates nothing", async () => {
    const result = { intent: "open_to_opportunity" };
    const triage = vi.fn().mockResolvedValue(result);
    const body = { messageText: "sure, tell me more" };

    expect(await controllerWith({ triage }).triage(body)).toBe(result);
    expect(triage).toHaveBeenCalledWith(body);
  });

  it("POST /inbound/attach returns the lead envelope", async () => {
    const attach = vi.fn().mockResolvedValue(LEAD);
    const body = { leadId: "lead_1", name: "A. Bekele", message: "yes", email: null };

    expect(await controllerWith({ attach }).attach(body, USER)).toEqual({ lead: LEAD });
    expect(attach).toHaveBeenCalledWith(body, USER);
  });

  it("POST /inbound/save returns the created lead envelope", async () => {
    const saveAsLead = vi.fn().mockResolvedValue(LEAD);
    const body = { name: "A. Bekele", message: "yes", email: null };

    expect(await controllerWith({ saveAsLead }).save(body, USER)).toEqual({ lead: LEAD });
    expect(saveAsLead).toHaveBeenCalledWith(body, USER);
  });
});

describe("InboundController — authentication and rate limiting", () => {
  it("refuses an unauthenticated caller with 401 before the model is called", async () => {
    const triage = vi.fn();

    await expect(
      throughGuards({
        controller: InboundController,
        method: "triage",
        guards: [new SessionAuthGuard(), new RateLimitGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ triage }).triage({ messageText: "hi" }),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(triage).not.toHaveBeenCalled();
    expect(h.checkRateLimit).not.toHaveBeenCalled();
  });

  it("spends the caller's own bucket, keyed exactly as the Next.js route keyed it", async () => {
    h.session = {
      user: { id: "u1", email: "op@desta.works", name: "Operator", role: "Associate" },
    };
    const triage = vi.fn().mockResolvedValue({});

    await throughGuards({
      controller: InboundController,
      method: "triage",
      guards: [new SessionAuthGuard(), new RateLimitGuard()],
      request: { headers: {} },
      invoke: () => controllerWith({ triage }).triage({ messageText: "hi" }),
    });

    expect(h.checkRateLimit).toHaveBeenCalledWith("inbound-triage:u1", {
      limit: 20,
      windowMs: 60_000,
    });
  });

  it("does not rate limit attach or save — neither route ever did", () => {
    const routes = describeRoutes(InboundController);
    expect(routes.filter((r) => r.rateLimit !== null).map((r) => r.route)).toEqual([
      "POST /inbound/triage",
    ]);
  });
});
