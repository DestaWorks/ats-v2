import "reflect-metadata";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `PlatformMetricsController` — transport only.
 *
 * The service has its own suite, so what is asserted here is the controller's whole contribution:
 * the window is validated at the boundary against the contract schema and nowhere else, the
 * SERVER's authenticated user is what reaches the service, and the response is passed through
 * unchanged. Plus the two structural properties Phase 8 asks for — that this endpoint holds no
 * database access, and that it is not part of any tenant's reporting surface.
 */

const h = vi.hoisted(() => ({ readMetrics: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
  installRequestContext: () => {},
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/platform-metrics.service", () => ({
  platformMetricsService: { readMetrics: h.readMetrics },
}));

/**
 * The injection token is owned by `tenants.module.ts` / `tenants.tokens.ts`, which wire this
 * controller. It is DI plumbing rather than behaviour, and the controller is constructed directly
 * below, so a stand-in symbol keeps this unit test independent of the module's wiring.
 */
vi.mock("./tenants.tokens", () => ({
  PLATFORM_METRICS_SERVICE: Symbol("PLATFORM_METRICS_SERVICE"),
}));

import { platformMetricsQuerySchema } from "@destaworks/contracts/validation/platform-metrics";
import { platformMetricsService } from "@destaworks/application/platform-metrics.service";
import type { AuthUser } from "@destaworks/auth/guards";
import { PlatformMetricsController } from "./platform-metrics.controller";

const user: AuthUser = { id: "u-platform", email: "ops@destaworks.com", name: "Ops" };

const response = {
  metrics: {
    window: { since: "2026-07-21T00:00:00.000Z", until: "2026-08-20T00:00:00.000Z", days: 30 },
    tenants: { total: 3, byStatus: [], byPlan: [] },
    seats: { seatsLicensed: 50, seatsUsed: 37, tenantsWithoutSeatLimit: 0 },
    signups: [],
    activity: { activeTenants: 2, liveTenants: 3 },
    jobs: { runsInWindow: 0, schedules: [] },
    aiUsage: { calls: 4, errors: 1, inputTokens: 123, outputTokens: 60 },
    storage: { documents: 3, knownBytes: 600, documentsOfUnknownSize: 1 },
    coverage: { tenantsScanned: 3, tenantsTotal: 3, truncated: false },
  },
};

const controller = new PlatformMetricsController(platformMetricsService);

beforeEach(() => {
  vi.clearAllMocks();
  h.readMetrics.mockResolvedValue(response);
});

describe("GET /platform/metrics", () => {
  it("hands the service the validated window and the SERVER's user", async () => {
    await controller.read({ days: 7 }, user);

    expect(h.readMetrics).toHaveBeenCalledWith(user, { days: 7 });
  });

  it("returns what the service composed, unchanged", async () => {
    await expect(controller.read({ days: 30 }, user)).resolves.toBe(response);
  });

  it("adds nothing of its own to the response", async () => {
    const result = await controller.read({ days: 30 }, user);

    expect(Object.keys(result)).toEqual(["metrics"]);
  });

  it("lets a refusal from the service through rather than answering anyway", async () => {
    h.readMetrics.mockRejectedValue(
      Object.assign(new Error("You don't have permission to do that"), { code: "FORBIDDEN" }),
    );

    await expect(controller.read({ days: 30 }, user)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("the window is validated at the boundary, against the contract", () => {
  it("defaults to 30 days when the caller asks for no window", () => {
    expect(platformMetricsQuerySchema.parse({})).toEqual({ days: 30 });
  });

  it("coerces the query string a URL actually delivers", () => {
    expect(platformMetricsQuerySchema.parse({ days: "7" })).toEqual({ days: 7 });
  });

  it("refuses a window that would make every aggregate an unbounded scan", () => {
    expect(platformMetricsQuerySchema.safeParse({ days: 181 }).success).toBe(false);
    expect(platformMetricsQuerySchema.safeParse({ days: 0 }).success).toBe(false);
    expect(platformMetricsQuerySchema.safeParse({ days: 1.5 }).success).toBe(false);
  });

  it("rejects an unknown key rather than ignoring it", () => {
    expect(platformMetricsQuerySchema.safeParse({ days: 7, tenantId: "t1" }).success).toBe(false);
  });
});

describe("the endpoint is transport, and is not tenant surface", () => {
  const source = readFileSync(new URL("./platform-metrics.controller.ts", import.meta.url), "utf8");
  const imported = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1] ?? "");
  // The prose above the class explains why a TenantGuard would be wrong here, so the structural
  // assertions below have to read the code rather than the comment that describes it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("reaches no repository and no database package", () => {
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter((specifier) => specifier.includes("@destaworks/db"))).toEqual([]);
    expect(imported.filter((specifier) => /repositor/i.test(specifier))).toEqual([]);
  });

  it("declares no tenant guard and no tenant capability — this is the platform axis", () => {
    expect(code).not.toMatch(/TenantGuard/);
    expect(code).not.toMatch(/@RequireCapability/);
    expect(code).toMatch(/@UseGuards\(SessionAuthGuard\)/);
  });

  it("is mounted outside the reporting surface", () => {
    expect(code).toMatch(/@Controller\("platform\/metrics"\)/);
    expect(imported.filter((specifier) => /report/i.test(specifier))).toEqual([]);
  });
});
