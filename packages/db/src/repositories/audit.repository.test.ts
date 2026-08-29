import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The audit repository's PURE query-building for the Wave 2.5 whole-log Activity Log — proven
 * WITHOUT a DB by mocking Prisma and asserting the `where`/`orderBy`/`take`/`select` it hands to
 * `findMany`/`findUnique`/`groupBy`. Covers the filter AND-combining, the `(at desc, id desc)`
 * keyset predicate, the date-range bounds, the `take` passthrough, that the list SELECT is scoped
 * (before/after present only to derive `hasChanges`, no relations), and `distinctActors` mapping.
 */

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../prisma", () => {
  const prisma: Record<string, unknown> = {
    activityLog: { findMany: h.findMany, findUnique: h.findUnique, groupBy: h.groupBy },
  };
  // The seam builds its client with `prisma.$extends(...)`. Returning the fake unchanged keeps
  // these assertions about the query the REPOSITORY composes; that the extension then adds the
  // tenant filter is proven against real Prisma in `tenant-scope.test.ts`.
  prisma["$extends"] = () => prisma;
  return { prisma };
});

import { auditRepository } from "./audit.repository";
import type { PageCursor } from "@destaworks/contracts/validation/cursor";

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([]);
  h.findUnique.mockReset().mockResolvedValue(null);
  h.groupBy.mockReset().mockResolvedValue([]);
});

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("auditRepository.listForEntity — per-entity trail", () => {
  it("filters by entity/entityId, orders newest-first, and caps the result (perf audit 2026-08-03 — was unbounded)", async () => {
    await auditRepository.listForEntity(ctx, "candidate", "c1");
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ entity: "candidate", entityId: "c1" });
    expect(arg.orderBy).toEqual({ at: "desc" });
    expect(arg.take).toBe(200);
  });
});

describe("auditRepository.list — filters + keyset", () => {
  it("orders (at desc, id desc), passes `take`, and selects before/after ONLY to derive hasChanges", async () => {
    await auditRepository.list(ctx, {}, null, 51);
    const arg = h.findMany.mock.calls[0]![0];
    expect(arg.orderBy).toEqual([{ at: "desc" }, { id: "desc" }]);
    expect(arg.take).toBe(51);
    expect(arg.select).toEqual({
      id: true,
      at: true,
      actor: true,
      action: true,
      entity: true,
      entityId: true,
      before: true,
      after: true,
    });
    // No relation include — the list read is flat.
    expect(arg.include).toBeUndefined();
    expect(arg.where).toEqual({});
  });

  it("AND-combines action / entity / actor equality filters", async () => {
    await auditRepository.list(
      ctx,
      { action: "purge", entity: "candidate", actor: "u9" },
      null,
      51,
    );
    const { where } = h.findMany.mock.calls[0]![0];
    expect(where).toMatchObject({ action: "purge", entity: "candidate", actor: "u9" });
  });

  it("builds a HALF-OPEN [from, to) range on `at` — the same bound the candidate list uses", async () => {
    const from = new Date("2026-06-01T00:00:00.000Z");
    const to = new Date("2026-07-01T00:00:00.000Z");
    await auditRepository.list(ctx, { from, to }, null, 51);
    const { where } = h.findMany.mock.calls[0]![0];
    // Was `lte` against a 23:59:59.999 "day end", which excluded the tail of the final second
    // and disagreed with `candidate.repository`'s `lt: addedTo` for the same "to = today" filter.
    expect(where.at).toEqual({ gte: from, lt: to });
  });

  it("adds the (at desc, id desc) keyset OR predicate for a cursor", async () => {
    const cursor: PageCursor = { kind: "at", value: "2026-06-01T12:00:00.000Z", id: "a1" };
    await auditRepository.list(ctx, {}, cursor, 51);
    const { where } = h.findMany.mock.calls[0]![0];
    expect(where.OR).toEqual([
      { at: { lt: new Date(cursor.value) } },
      { at: new Date(cursor.value), id: { lt: cursor.id } },
    ]);
  });
});

describe("auditRepository.findById — detail read", () => {
  it("looks up the ONE row by id (returns before/after — no select scoping)", async () => {
    await auditRepository.findById(ctx, "a1");
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "a1" } });
  });
});

describe("auditRepository.distinctActors", () => {
  it("groupBy actor → the list of actor ids", async () => {
    h.groupBy.mockResolvedValue([{ actor: "u1" }, { actor: "u2" }]);
    await expect(auditRepository.distinctActors(ctx)).resolves.toEqual(["u1", "u2"]);
    expect(h.groupBy).toHaveBeenCalledWith({ by: ["actor"] });
  });
});
