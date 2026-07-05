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
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    activityLog: { findMany: h.findMany, findUnique: h.findUnique, groupBy: h.groupBy },
  },
}));

import { auditRepository } from "./audit.repository";
import type { PageCursor } from "@/lib/validation/cursor";

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([]);
  h.findUnique.mockReset().mockResolvedValue(null);
  h.groupBy.mockReset().mockResolvedValue([]);
});

describe("auditRepository.list — filters + keyset", () => {
  it("orders (at desc, id desc), passes `take`, and selects before/after ONLY to derive hasChanges", async () => {
    await auditRepository.list({}, null, 51);
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
    await auditRepository.list({ action: "purge", entity: "candidate", actor: "u9" }, null, 51);
    const { where } = h.findMany.mock.calls[0]![0];
    expect(where).toMatchObject({ action: "purge", entity: "candidate", actor: "u9" });
  });

  it("builds a gte/lte range on `at` from from/to", async () => {
    const from = new Date("2026-06-01T00:00:00.000Z");
    const to = new Date("2026-06-30T23:59:59.999Z");
    await auditRepository.list({ from, to }, null, 51);
    const { where } = h.findMany.mock.calls[0]![0];
    expect(where.at).toEqual({ gte: from, lte: to });
  });

  it("adds the (at desc, id desc) keyset OR predicate for a cursor", async () => {
    const cursor: PageCursor = { kind: "at", value: "2026-06-01T12:00:00.000Z", id: "a1" };
    await auditRepository.list({}, cursor, 51);
    const { where } = h.findMany.mock.calls[0]![0];
    expect(where.OR).toEqual([
      { at: { lt: new Date(cursor.value) } },
      { at: new Date(cursor.value), id: { lt: cursor.id } },
    ]);
  });
});

describe("auditRepository.findById — detail read", () => {
  it("looks up the ONE row by id (returns before/after — no select scoping)", async () => {
    await auditRepository.findById("a1");
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: "a1" } });
  });
});

describe("auditRepository.distinctActors", () => {
  it("groupBy actor → the list of actor ids", async () => {
    h.groupBy.mockResolvedValue([{ actor: "u1" }, { actor: "u2" }]);
    await expect(auditRepository.distinctActors()).resolves.toEqual(["u1", "u2"]);
    expect(h.groupBy).toHaveBeenCalledWith({ by: ["actor"] });
  });
});
