import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `SourcingController` — `POST /sourcing/similar`, ported from
 * `apps/web/src/app/api/sourcing/similar`.
 *
 * One endpoint, so the interesting assertions are the ones about what it is NOT: no capability
 * gate (it searches public NPPES data, matching Discover beside it), and no rate limit of its own —
 * the limiter it needs lives inside the similarity service, and adding a second one here would
 * halve the real budget without anyone deciding to.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
}));

vi.mock("@destaworks/auth/auth", () => ({
  auth: { api: { getSession: async () => h.session } },
}));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/application/lead.service", () => ({ leadService: {} }));
vi.mock("@destaworks/application/similarity.service", () => ({ similarityService: {} }));

import type { AuthContext } from "@destaworks/auth/guards";
import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import {
  describeRoutes,
  serviceStub,
  throughGuards,
} from "../../common/testing/controller-contract";
import { SourcingController } from "./sourcing.controller";

installNestRequestContext();

type SimilarityService = ConstructorParameters<typeof SourcingController>[0];

function controllerWith(methods: Partial<SimilarityService>): SourcingController {
  return new SourcingController(serviceStub<SimilarityService>(methods));
}

const USER: AuthContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "op@desta.works", name: "Operator" },
  role: "Associate",
};

beforeEach(() => {
  h.session = null;
});

describe("SourcingController — declared routes", () => {
  it("serves POST /sourcing/similar at 200, session-guarded and ungated", () => {
    expect(describeRoutes(SourcingController)).toEqual([
      {
        route: "POST /sourcing/similar",
        guards: ["SessionAuthGuard"],
        capability: null,
        rateLimit: null,
        status: 200,
      },
    ]);
  });
});

describe("SourcingController — delegation", () => {
  it("passes the anchor and the caller through and returns the result unwrapped", async () => {
    const result = { taxonomyLabel: "Psychiatric NP (PMHNP)", results: [] };
    const findSimilar = vi.fn().mockResolvedValue(result);
    const body = { credential: "PMHNP", state: "TX" };

    expect(await controllerWith({ findSimilar }).similar(body, USER)).toBe(result);
    expect(findSimilar).toHaveBeenCalledWith(body, USER);
  });
});

describe("SourcingController — authentication", () => {
  it("refuses an unauthenticated caller with 401 before the search runs", async () => {
    const findSimilar = vi.fn();

    await expect(
      throughGuards({
        controller: SourcingController,
        method: "similar",
        guards: [new SessionAuthGuard()],
        request: { headers: {} },
        invoke: () => controllerWith({ findSimilar }).similar({ credential: "PMHNP" }, USER),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });

    expect(findSimilar).not.toHaveBeenCalled();
  });
});
