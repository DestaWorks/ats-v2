import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `platformMetricsRepository` — and, above all, whether its cross-tenant aggregate is RIGHT rather
 * than merely non-throwing.
 *
 * The failure this suite exists to catch has no exception and no stack trace. Under
 * `FORCE ROW LEVEL SECURITY` a tenant-scoped aggregate issued on a connection that never announced
 * a tenant returns zero rows, so the installation-wide AI total would render as a confident `0`
 * and stay that way. The mirror-image failure is just as quiet: if the per-tenant loop announced a
 * tenant but did NOT also filter, every iteration would read every tenant's rows and the totals
 * would come out multiplied by the tenant count.
 *
 * So the fake below is not a stub that returns fixtures. It reproduces BOTH production mechanisms
 * against an in-memory dataset spanning three tenants:
 *
 *   1. the enforcement seam, by injecting `tenantId` into the `where` of every tenant-scoped query
 *   2. the RLS policy, by discarding any row whose `tenantId` differs from the announced one, and
 *      discarding EVERY row when nothing was announced
 *
 * A repository that got either half wrong produces a visibly wrong number here.
 */

interface AiRow {
  tenantId: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}

interface DocRow {
  tenantId: string;
  sizeBytes: number | null;
  deletedAt: Date | null;
  createdAt: Date;
}

const DAY = 86_400_000;
const UNTIL = new Date("2026-08-20T00:00:00.000Z");
const SINCE = new Date(UNTIL.getTime() - 7 * DAY);
const INSIDE = new Date("2026-08-18T00:00:00.000Z");
const BEFORE_WINDOW = new Date("2026-07-01T00:00:00.000Z");

const AI_ROWS: AiRow[] = [
  { tenantId: "t1", status: "success", inputTokens: 10, outputTokens: 5, createdAt: INSIDE },
  { tenantId: "t1", status: "success", inputTokens: 10, outputTokens: 5, createdAt: INSIDE },
  { tenantId: "t1", status: "error", inputTokens: 3, outputTokens: null, createdAt: INSIDE },
  { tenantId: "t2", status: "success", inputTokens: 100, outputTokens: 50, createdAt: INSIDE },
  // Outside the window: must not be counted by anyone.
  {
    tenantId: "t2",
    status: "success",
    inputTokens: 999,
    outputTokens: 999,
    createdAt: BEFORE_WINDOW,
  },
  // t3 has no AI usage at all — a tenant contributing zero must not break the walk.
];

const DOC_ROWS: DocRow[] = [
  { tenantId: "t1", sizeBytes: 100, deletedAt: null, createdAt: INSIDE },
  { tenantId: "t1", sizeBytes: null, deletedAt: null, createdAt: INSIDE },
  { tenantId: "t2", sizeBytes: 500, deletedAt: null, createdAt: INSIDE },
  // Soft-deleted: excluded by the repository's own predicate, not by RLS.
  { tenantId: "t2", sizeBytes: 4_000, deletedAt: INSIDE, createdAt: INSIDE },
];

/** The tenants the loop announced, in order. */
const announced: string[] = [];

/**
 * Evaluate one `where` against a row. Supports exactly the operators the repository composes;
 * anything else would be a silently-passing predicate, so unknown keys throw.
 */
function matches(where: Record<string, unknown>, row: Record<string, unknown>): boolean {
  for (const [field, condition] of Object.entries(where)) {
    const value = row[field];
    if (condition === null) {
      if (value !== null) return false;
    } else if (typeof condition === "object" && condition !== null) {
      const range = condition as { gte?: Date; lt?: Date; gt?: Date };
      const at = value instanceof Date ? value.getTime() : Number.NaN;
      if (range.gte !== undefined && at < range.gte.getTime()) return false;
      if (range.lt !== undefined && at >= range.lt.getTime()) return false;
      if (range.gt !== undefined && at <= range.gt.getTime()) return false;
    } else if (value !== condition) {
      return false;
    }
  }
  return true;
}

/**
 * Both controls, as production applies them.
 *
 * `tenantId` is added to the `where` (the seam) and then the surviving rows are filtered again on
 * the announced setting (the RLS policy). `undefined` for `announced` models a connection that
 * never identified itself, which is the case that must yield nothing.
 */
function visible<T extends { tenantId: string }>(
  rows: T[],
  where: Record<string, unknown>,
  announcedTenant: string | undefined,
): T[] {
  if (announcedTenant === undefined) return [];
  const scoped = { ...where, tenantId: announcedTenant };
  return rows.filter((row) => row.tenantId === announcedTenant && matches(scoped, row));
}

const h = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));

vi.mock("server-only", () => ({}));

/**
 * The unscoped client carries ONLY the global models. `aiUsageEvent` and `document` are absent, so
 * a repository that ever reached for a tenant-scoped table outside an announced transaction fails
 * here with a type error at runtime rather than quietly returning a wrong total.
 */
vi.mock("../prisma", () => ({
  db: () => h.prisma,
  prisma: h.prisma,
}));

vi.mock("../tenant-transaction", () => ({
  withTenantTransaction: async (
    ctx: { tenantId: string },
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    announced.push(ctx.tenantId);
    const tenant = ctx.tenantId;
    const tx = {
      aiUsageEvent: {
        aggregate: async ({ where }: { where: Record<string, unknown> }) => {
          const rows = visible(AI_ROWS, where, tenant);
          return {
            _count: { _all: rows.length },
            _sum: {
              inputTokens: rows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
              outputTokens: rows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
            },
          };
        },
        count: async ({ where }: { where: Record<string, unknown> }) =>
          visible(AI_ROWS, where, tenant).length,
      },
      document: {
        aggregate: async ({ where }: { where: Record<string, unknown> }) => {
          const rows = visible(DOC_ROWS, where, tenant);
          return {
            _count: {
              _all: rows.length,
              sizeBytes: rows.filter((row) => row.sizeBytes !== null).length,
            },
            _sum: { sizeBytes: rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0) },
          };
        },
      },
    };
    return await fn(tx);
  },
}));

import { platformMetricsRepository } from "./platform-metrics.repository";

beforeEach(() => {
  announced.length = 0;
  h.prisma = {};
});

describe("the cross-tenant aggregate is correct, not silently empty", () => {
  it("announces each tenant in turn and sums what each one can legitimately see", async () => {
    const perTenant = [];
    for (const tenantId of ["t1", "t2", "t3"]) {
      perTenant.push(await platformMetricsRepository.tenantScopedUsage(tenantId, SINCE, UNTIL));
    }

    expect(announced).toEqual(["t1", "t2", "t3"]);

    // t1: three events in the window, one of them an error. t2: one in the window, one older.
    expect(perTenant[0]).toMatchObject({ aiCalls: 3, aiErrors: 1, aiInputTokens: 23 });
    expect(perTenant[1]).toMatchObject({ aiCalls: 1, aiErrors: 0, aiInputTokens: 100 });
    expect(perTenant[2]).toMatchObject({ aiCalls: 0, aiErrors: 0, aiInputTokens: 0 });
  });

  it("totals the installation exactly once — neither zero nor multiplied by the tenant count", async () => {
    let calls = 0;
    let inputTokens = 0;
    for (const tenantId of ["t1", "t2", "t3"]) {
      const row = await platformMetricsRepository.tenantScopedUsage(tenantId, SINCE, UNTIL);
      calls += row.aiCalls;
      inputTokens += row.aiInputTokens;
    }

    // The true answer. `0` would be the FORCE-RLS failure; `12` (4 x 3 tenants) would be the
    // announced-but-unfiltered failure. Both are silent in production; neither passes here.
    expect(calls).toBe(4);
    expect(inputTokens).toBe(123);
    expect(calls).toBeGreaterThan(0);
  });

  it("would read nothing at all on a connection that announced no tenant", () => {
    // The naive spelling this repository refuses: one aggregate on an unscoped client. Asserted
    // against the same RLS simulation the passing cases use, so the contrast is like-for-like.
    expect(visible(AI_ROWS, { createdAt: { gte: SINCE, lt: UNTIL } }, undefined)).toHaveLength(0);
  });

  it("counts documents per tenant, excluding soft-deleted rows, and reports unknown sizes", async () => {
    const t1 = await platformMetricsRepository.tenantScopedUsage("t1", SINCE, UNTIL);
    const t2 = await platformMetricsRepository.tenantScopedUsage("t2", SINCE, UNTIL);

    expect(t1).toMatchObject({ documents: 2, documentBytes: 100, documentsOfUnknownSize: 1 });
    // The 4,000-byte row is soft-deleted, so it is absent from both the count and the sum.
    expect(t2).toMatchObject({ documents: 1, documentBytes: 500, documentsOfUnknownSize: 0 });
  });

  it("never reaches a tenant-scoped table through the unscoped client", async () => {
    // `h.prisma` carries no `aiUsageEvent` and no `document`; the walk still succeeds, which is
    // only possible if every tenant-scoped read went through an announced transaction.
    await expect(
      platformMetricsRepository.tenantScopedUsage("t1", SINCE, UNTIL),
    ).resolves.toBeDefined();
  });
});

describe("the global reads need no announcement, because they are outside every tenant", () => {
  it("groups live tenants by status and by plan", async () => {
    h.prisma = {
      tenant: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { status: "active", _count: { _all: 4 } },
            { status: "trial", _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([{ plan: "pro", _count: { _all: 6 } }]),
        count: vi.fn().mockResolvedValue(6),
      },
    };

    await expect(platformMetricsRepository.tenantCounts()).resolves.toEqual({
      total: 6,
      byStatus: [
        { key: "active", count: 4 },
        { key: "trial", count: 2 },
      ],
      byPlan: [{ key: "pro", count: 6 }],
    });
  });

  it("reports seat totals for the installation, never a per-tenant comparison", async () => {
    h.prisma = {
      tenant: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { seatLimit: 50 } }),
        count: vi.fn().mockResolvedValue(1),
      },
      membership: { count: vi.fn().mockResolvedValue(37) },
    };

    await expect(platformMetricsRepository.seatTotals()).resolves.toEqual({
      seatsLicensed: 50,
      seatsUsed: 37,
      tenantsWithoutSeatLimit: 1,
    });
  });

  it("treats an installation that licenses no seats at all as zero, not null", async () => {
    h.prisma = {
      tenant: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { seatLimit: null } }),
        count: vi.fn().mockResolvedValue(3),
      },
      membership: { count: vi.fn().mockResolvedValue(0) },
    };

    await expect(platformMetricsRepository.seatTotals()).resolves.toMatchObject({
      seatsLicensed: 0,
    });
  });

  it("counts a tenant as active once, however many signed-in members it has", async () => {
    h.prisma = {
      session: {
        findMany: vi.fn().mockResolvedValue([{ userId: "u1" }, { userId: "u2" }, { userId: "u1" }]),
      },
      membership: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ tenantId: "t1" }, { tenantId: "t1" }, { tenantId: "t2" }]),
      },
    };

    await expect(platformMetricsRepository.activeTenantCount(UNTIL)).resolves.toBe(2);
  });

  it("asks for no memberships when nobody holds a live session", async () => {
    const findMany = vi.fn();
    h.prisma = { session: { findMany: vi.fn().mockResolvedValue([]) }, membership: { findMany } };

    await expect(platformMetricsRepository.activeTenantCount(UNTIL)).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reports schedule claims with the most recent occurrence of each", async () => {
    h.prisma = {
      scheduleRun: {
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { schedule: "daily-brief", _count: { _all: 7 }, _max: { occurrenceAt: INSIDE } },
          ]),
      },
    };

    await expect(platformMetricsRepository.scheduleHealth(SINCE, UNTIL)).resolves.toEqual([
      { schedule: "daily-brief", runs: 7, lastOccurrenceAt: INSIDE },
    ]);
  });

  it("bounds the tenant walk and reports the true total alongside it", async () => {
    h.prisma = {
      tenant: {
        findMany: vi.fn().mockResolvedValue([{ id: "t1" }, { id: "t2" }]),
        count: vi.fn().mockResolvedValue(9),
      },
    };

    await expect(platformMetricsRepository.tenantsToScan()).resolves.toEqual({
      ids: ["t1", "t2"],
      total: 9,
    });
  });
});
