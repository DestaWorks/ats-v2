import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The candidate repository's PURE query-building — proven WITHOUT a DB by mocking Prisma and
 * asserting the `where`/`orderBy` it hands to `findMany`/`count`/`groupBy`. Covers the keyset
 * predicate for every sort order, the new filters AND-combining, and the `overdue`/`stuck`
 * threshold predicates (matched to the `isOverdue`/`isStuck` boundaries).
 */

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    candidate: { findMany: h.findMany, count: h.count, groupBy: h.groupBy, delete: h.delete },
  },
}));
// Crypto is a passthrough here — these tests never assert on encrypted columns.
vi.mock("@/server/db/field-crypto", () => ({
  encryptField: (v: string) => v,
  decryptField: (v: string) => v,
}));

import {
  candidateRepository,
  buildCandidateWhere,
  overdueWhere,
  stuckWhere,
  STUCK_DAYS,
} from "./candidate.repository";
import { statusSlaDays, ACTIVE_STATUS_CODES } from "@/lib/constants";

const NOW = new Date("2026-07-01T00:00:00.000Z");
const DAY = 86_400_000;

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([]);
  h.count.mockReset().mockResolvedValue(0);
  h.groupBy.mockReset().mockResolvedValue([]);
  h.delete.mockReset().mockResolvedValue({ id: "c1" });
});

describe("purge — permanent hard delete", () => {
  it("calls candidate.delete keyed on the id (cascade is a DB-level FK concern)", async () => {
    await candidateRepository.purge("c1");
    expect(h.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

describe("listDeleted — the Trash read", () => {
  it("queries ONLY soft-deleted rows, newest-deleted first", async () => {
    await candidateRepository.listDeleted();
    expect(h.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    });
  });

  it("applies the `take` cap when given", async () => {
    await candidateRepository.listDeleted(200);
    expect(h.findMany).toHaveBeenCalledWith({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    });
  });
});

describe("buildCandidateWhere — filters AND-combine", () => {
  it("excludes soft-deleted by default and folds equality filters onto the top level", () => {
    const where = buildCandidateWhere(
      {
        track: "Clinical",
        clientId: "cl1",
        licenseStatus: "Active",
        createdById: "u1",
        tags: ["Priority"],
      },
      NOW,
    );
    expect(where.deletedAt).toBeNull();
    expect(where).toMatchObject({
      track: "Clinical",
      clientId: "cl1",
      licenseStatus: "Active",
      createdById: "u1",
      tags: { hasSome: ["Priority"] },
    });
  });

  it("includeDeleted drops the deletedAt guard", () => {
    expect("deletedAt" in buildCandidateWhere({ includeDeleted: true }, NOW)).toBe(false);
  });

  it("search + overdue + stuck all land under AND (no OR clobbering)", () => {
    const where = buildCandidateWhere({ search: "jane", overdue: true, stuck: true }, NOW);
    expect(Array.isArray(where.AND)).toBe(true);
    const and = where.AND as Record<string, unknown>[];
    // search OR
    expect(and).toContainEqual({
      OR: [
        { name: { contains: "jane", mode: "insensitive" } },
        { email: { contains: "jane", mode: "insensitive" } },
      ],
    });
    // stuck + overdue predicates present
    expect(and).toContainEqual(stuckWhere(NOW));
    expect(and).toContainEqual(overdueWhere(NOW));
  });
});

describe("overdueWhere / stuckWhere predicates", () => {
  it("overdue is an OR over exactly the active stages that carry an SLA", () => {
    const where = overdueWhere(NOW);
    const clauses = where.OR as { status: string; stageEnteredAt: { lt: Date } }[];
    const withSla = ACTIVE_STATUS_CODES.filter((s) => statusSlaDays(s) !== null);
    expect(clauses).toHaveLength(withSla.length);
    // STARTED_DAY1 has slaDays: null → never overdue → absent.
    expect(clauses.some((c) => c.status === "STARTED_DAY1")).toBe(false);
    // Each threshold is now - slaDays*24h for that status.
    const screening = clauses.find((c) => c.status === "INITIAL_SCREENING")!;
    expect(screening.stageEnteredAt.lt).toEqual(
      new Date(NOW.getTime() - statusSlaDays("INITIAL_SCREENING")! * DAY),
    );
  });

  it("stuck = in-stage > STUCK_DAYS AND active (stageOrder < 9)", () => {
    const where = stuckWhere(NOW);
    expect(where).toEqual({
      stageEnteredAt: { lt: new Date(NOW.getTime() - STUCK_DAYS * DAY) },
      stageOrder: { lt: 9 },
    });
  });
});

describe("list — keyset predicate + orderBy tuple", () => {
  it("createdAt_desc: orderBy [createdAt desc, id desc], keyset uses lt", async () => {
    await candidateRepository.list({
      orderBy: "createdAt_desc",
      cursor: { kind: "createdAt", value: "2026-06-01T00:00:00.000Z", id: "c1" },
      take: 26,
      now: NOW,
    });
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.take).toBe(26);
    const dt = new Date("2026-06-01T00:00:00.000Z");
    expect(arg.where.AND).toContainEqual({
      OR: [{ createdAt: { lt: dt } }, { createdAt: dt, id: { lt: "c1" } }],
    });
  });

  it("createdAt_asc: orderBy asc + keyset uses gt", async () => {
    await candidateRepository.list({
      orderBy: "createdAt_asc",
      cursor: { kind: "createdAt", value: "2026-06-01T00:00:00.000Z", id: "c1" },
      now: NOW,
    });
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    const dt = new Date("2026-06-01T00:00:00.000Z");
    expect(arg.where.AND).toContainEqual({
      OR: [{ createdAt: { gt: dt } }, { createdAt: dt, id: { gt: "c1" } }],
    });
  });

  it("name_asc: orderBy [name asc, id asc], keyset walks name", async () => {
    await candidateRepository.list({
      orderBy: "name_asc",
      cursor: { kind: "name", value: "Jane", id: "c1" },
      now: NOW,
    });
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
    expect(arg.where.AND).toContainEqual({
      OR: [{ name: { gt: "Jane" } }, { name: "Jane", id: { gt: "c1" } }],
    });
  });

  it("no cursor → no keyset clause; default orderBy is createdAt_desc", async () => {
    await candidateRepository.list({ now: NOW });
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(arg.where.AND).toBeUndefined();
  });

  it("keyset composes UNDER the same AND as the filters (mine + cursor)", async () => {
    await candidateRepository.list({
      createdById: "u1",
      orderBy: "createdAt_desc",
      cursor: { kind: "createdAt", value: "2026-06-01T00:00:00.000Z", id: "c1" },
      now: NOW,
    });
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.where.createdById).toBe("u1"); // filter stays top-level
    expect(Array.isArray(arg.where.AND)).toBe(true); // keyset merged into AND
  });
});

describe("count / groupByStatusFiltered", () => {
  it("count uses the shared where (no cursor/orderBy/take)", async () => {
    await candidateRepository.count({ track: "Operations", now: NOW });
    const arg = h.count.mock.calls[0]![0];
    expect(arg.where).toMatchObject({ track: "Operations", deletedAt: null });
    expect("orderBy" in arg).toBe(false);
  });

  it("groupByStatusFiltered drops the status filter and groups by status", async () => {
    await candidateRepository.groupByStatusFiltered({
      status: "NEW_CANDIDATE",
      clientId: "cl1",
      now: NOW,
    });
    const arg = h.groupBy.mock.calls[0]![0];
    expect(arg.by).toEqual(["status"]);
    expect(arg.where.clientId).toBe("cl1");
    expect("status" in arg.where).toBe(false); // status is NOT applied (board groups across statuses)
  });
});
