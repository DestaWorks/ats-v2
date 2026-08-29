import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { fixedClock } from "@destaworks/domain/clock";

/**
 * `platformMetricsService` — the installation view (Phase 8).
 *
 * The real `requirePlatformCapability` runs, driven by the environment, for the same reason it
 * does in `platform-admin.service.test.ts`: the point of this axis is that authority comes from
 * deployment configuration and from nothing a tenant can express. Only the capability SET it
 * returns is narrowable here, so the `readTenantData` branch can be exercised while every
 * admission decision stays real.
 */

const h = vi.hoisted(() => ({
  /** `null` = whatever the real minter granted. Otherwise, a narrowed set. */
  capabilities: null as readonly string[] | null,
  tenantCounts: vi.fn(),
  seatTotals: vi.fn(),
  signupInstants: vi.fn(),
  activeTenantCount: vi.fn(),
  scheduleHealth: vi.fn(),
  tenantsToScan: vi.fn(),
  tenantScopedUsage: vi.fn(),
  logged: [] as { event: string; fields: Record<string, unknown> }[],
}));

vi.mock("server-only", () => ({}));

vi.mock("@destaworks/config/logger", () => ({
  logger: {
    info: (event: string, fields: Record<string, unknown>) => h.logged.push({ event, fields }),
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

vi.mock("@destaworks/db/tenancy/platform-metrics.repository", () => ({
  platformMetricsRepository: {
    tenantCounts: h.tenantCounts,
    seatTotals: h.seatTotals,
    signupInstants: h.signupInstants,
    activeTenantCount: h.activeTenantCount,
    scheduleHealth: h.scheduleHealth,
    tenantsToScan: h.tenantsToScan,
    tenantScopedUsage: h.tenantScopedUsage,
  },
}));

vi.mock("@destaworks/auth/platform-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@destaworks/auth/platform-admin")>();
  return {
    ...actual,
    requirePlatformCapability: (
      user: Parameters<typeof actual.requirePlatformCapability>[0],
      capability: Parameters<typeof actual.requirePlatformCapability>[1],
    ) => {
      const context = actual.requirePlatformCapability(user, capability);
      if (h.capabilities === null) return context;
      return { ...context, capabilities: h.capabilities };
    },
  };
});

import { platformMetricsService } from "./platform-metrics.service";
import type { AuthUser } from "@destaworks/auth/guards";

const ORIGINAL = process.env["PLATFORM_ADMIN_USER_IDS"];

const admin: AuthUser = { id: "u-platform", email: "ops@destaworks.com", name: "Ops" };
/** The most privileged identity a TENANT can produce. It must get nothing here. */
const tenantOwner: AuthUser = { id: "u-owner", email: "owner@acme.example", name: "Acme Owner" };

const NOW = new Date("2026-08-20T09:30:00.000Z");
const clock = fixedClock(NOW);

const usage = {
  aiCalls: 4,
  aiErrors: 1,
  aiInputTokens: 123,
  aiOutputTokens: 60,
  documents: 3,
  documentBytes: 600,
  documentsOfUnknownSize: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.capabilities = null;
  h.logged.length = 0;
  process.env["PLATFORM_ADMIN_USER_IDS"] = "u-platform";
  h.tenantCounts.mockResolvedValue({
    total: 3,
    byStatus: [{ key: "active", count: 3 }],
    byPlan: [{ key: "pro", count: 3 }],
  });
  h.seatTotals.mockResolvedValue({ seatsLicensed: 50, seatsUsed: 37, tenantsWithoutSeatLimit: 0 });
  h.signupInstants.mockResolvedValue([]);
  h.activeTenantCount.mockResolvedValue(2);
  h.scheduleHealth.mockResolvedValue([]);
  h.tenantsToScan.mockResolvedValue({ ids: ["t1", "t2", "t3"], total: 3 });
  h.tenantScopedUsage.mockResolvedValue(usage);
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["PLATFORM_ADMIN_USER_IDS"];
  else process.env["PLATFORM_ADMIN_USER_IDS"] = ORIGINAL;
});

describe("no tenant role reaches the installation view", () => {
  it("refuses a tenant Owner, and reads nothing at all", async () => {
    await expect(
      platformMetricsService.readMetrics(tenantOwner, { days: 30 }, clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(h.tenantCounts).not.toHaveBeenCalled();
    expect(h.tenantScopedUsage).not.toHaveBeenCalled();
  });

  it("is refused identically when the plane is unconfigured", async () => {
    delete process.env["PLATFORM_ADMIN_USER_IDS"];

    await expect(
      platformMetricsService.readMetrics(admin, { days: 30 }, clock),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the installation-wide totals", () => {
  it("computes the window from the injected clock, half-open and backwards from now", async () => {
    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 7 }, clock);

    expect(metrics.window).toEqual({
      since: "2026-08-13T09:30:00.000Z",
      until: "2026-08-20T09:30:00.000Z",
      days: 7,
    });
  });

  it("sums the per-tenant walk into one total, once per tenant", async () => {
    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(h.tenantScopedUsage).toHaveBeenCalledTimes(3);
    expect(metrics.aiUsage).toEqual({ calls: 12, errors: 3, inputTokens: 369, outputTokens: 180 });
    expect(metrics.storage).toEqual({
      documents: 9,
      knownBytes: 1_800,
      documentsOfUnknownSize: 3,
    });
  });

  it("walks tenants sequentially, so the pool is never asked for N transactions at once", async () => {
    let inFlight = 0;
    let peak = 0;
    h.tenantScopedUsage.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return usage;
    });

    await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(peak).toBe(1);
  });

  it("passes every tenant the same window it reported", async () => {
    await platformMetricsService.readMetrics(admin, { days: 7 }, clock);

    for (const call of h.tenantScopedUsage.mock.calls) {
      expect(call[1]).toEqual(new Date("2026-08-13T09:30:00.000Z"));
      expect(call[2]).toEqual(NOW);
    }
  });

  it("says so when the walk did not cover the whole installation", async () => {
    h.tenantsToScan.mockResolvedValue({ ids: ["t1"], total: 40 });

    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(metrics.coverage).toEqual({ tenantsScanned: 1, tenantsTotal: 40, truncated: true });
  });

  it("is not truncated when every tenant was walked", async () => {
    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(metrics.coverage).toEqual({ tenantsScanned: 3, tenantsTotal: 3, truncated: false });
  });

  it("survives an installation with no tenants, no schedules and no usage", async () => {
    h.tenantCounts.mockResolvedValue({ total: 0, byStatus: [], byPlan: [] });
    h.tenantsToScan.mockResolvedValue({ ids: [], total: 0 });
    h.activeTenantCount.mockResolvedValue(0);

    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 2 }, clock);

    expect(metrics.aiUsage).toEqual({ calls: 0, errors: 0, inputTokens: 0, outputTokens: 0 });
    expect(metrics.jobs).toEqual({ runsInWindow: 0, schedules: [] });
    expect(metrics.coverage.truncated).toBe(false);
  });

  it("totals schedule claims across every schedule in the window", async () => {
    h.scheduleHealth.mockResolvedValue([
      { schedule: "daily-brief", runs: 7, lastOccurrenceAt: NOW },
      { schedule: "weekly-brief", runs: 1, lastOccurrenceAt: null },
    ]);

    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(metrics.jobs.runsInWindow).toBe(8);
    expect(metrics.jobs.schedules).toEqual([
      { schedule: "daily-brief", runs: 7, lastOccurrenceAt: "2026-08-20T09:30:00.000Z" },
      { schedule: "weekly-brief", runs: 1, lastOccurrenceAt: null },
    ]);
  });
});

describe("the signup series", () => {
  it("emits one point per day in the window, zeroes included", async () => {
    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 3 }, clock);

    expect(metrics.signups).toEqual([
      { day: "2026-08-17", tenants: 0 },
      { day: "2026-08-18", tenants: 0 },
      { day: "2026-08-19", tenants: 0 },
    ]);
  });

  it("buckets signups onto their UTC day", async () => {
    h.signupInstants.mockResolvedValue([
      new Date("2026-08-18T01:00:00.000Z"),
      new Date("2026-08-18T23:59:59.000Z"),
      new Date("2026-08-19T00:00:00.000Z"),
    ]);

    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 3 }, clock);

    expect(metrics.signups).toEqual([
      { day: "2026-08-17", tenants: 0 },
      { day: "2026-08-18", tenants: 2 },
      { day: "2026-08-19", tenants: 1 },
    ]);
  });
});

describe("reading INSIDE tenants needs the capability that crosses the boundary", () => {
  it("returns null — not zero — for the tenant-scoped sections without readTenantData", async () => {
    h.capabilities = ["viewTenants"];

    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(metrics.aiUsage).toBeNull();
    expect(metrics.storage).toBeNull();
  });

  it("does not walk a single tenant without it", async () => {
    h.capabilities = ["viewTenants"];

    await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(h.tenantsToScan).not.toHaveBeenCalled();
    expect(h.tenantScopedUsage).not.toHaveBeenCalled();
  });

  it("still returns the global sections, which are nobody's tenant data", async () => {
    h.capabilities = ["viewTenants"];

    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(metrics.tenants.total).toBe(3);
    expect(metrics.seats.seatsUsed).toBe(37);
    expect(metrics.activity).toEqual({ activeTenants: 2, liveTenants: 3 });
  });
});

describe("the crossing is logged, and the log carries no PII", () => {
  it("records the actor id and the shape of the read", async () => {
    await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    expect(h.logged).toEqual([
      {
        event: "platform.metrics.read",
        fields: { actor: "u-platform", days: 30, tenantsScanned: 3, readInside: true },
      },
    ]);
  });

  it("never logs the admin's email or name", async () => {
    await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    const written = JSON.stringify(h.logged);
    expect(written).not.toContain("ops@destaworks.com");
    expect(written).not.toContain("Ops");
  });
});

describe("platform metrics are separate from any tenant's reports", () => {
  it("shares no module with the reporting surface", () => {
    const source = readFileSync(new URL("./platform-metrics.service.ts", import.meta.url), "utf8");
    const imported = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1] ?? "");

    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter((specifier) => /report/i.test(specifier))).toEqual([]);
    // Importing a TenantContext would mean this service could be asked a tenant's question.
    expect(imported.filter((specifier) => specifier.endsWith("/tenant"))).toEqual([]);
  });

  it("returns nothing that identifies a tenant, a client or a person", async () => {
    const { metrics } = await platformMetricsService.readMetrics(admin, { days: 30 }, clock);

    const written = JSON.stringify(metrics);
    for (const id of ["t1", "t2", "t3"]) expect(written).not.toContain(`"${id}"`);
    expect(written).not.toContain("u-platform");
  });
});
