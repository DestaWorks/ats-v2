import type { TenantContext } from "@destaworks/domain/tenant";
import type { Client, Prisma } from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";
import { REFERENCE_ROWS_CAP } from "../query-limits";

/** A raw client row (Prisma model). */
export type ClientRow = Client;

/**
 * Client data access — the ONLY layer that touches Prisma for clients. The `clients` table is
 * small (a handful of accounts), so the board read fetches them all once and builds an
 * `id → name` map rather than joining per candidate row (see `candidateService.listBoard`).
 * Soft-deleted rows are excluded by default (mirrors the candidate repository contract).
 */
export const clientRepository = {
  list(ctx: TenantContext, opts?: { includeDeleted?: boolean }, tx?: ScopedTx) {
    return db(ctx, tx).client.findMany({
      where: opts?.includeDeleted ? {} : { deletedAt: null },
      orderBy: { name: "asc" },
      take: REFERENCE_ROWS_CAP,
    });
  },

  /**
   * The `id → name` map every list/board/detail read builds — pulled out since it was hand-rolled
   * (`new Map(clients.map((c) => [c.id, c.name]))`) at 14 call sites across 5 services. Same
   * `includeDeleted`/`tx` passthrough as `list()`.
   *
   * Its own two-column query rather than a reuse of `list()`: this runs on every board, list and
   * detail read, and `Client` carries the whole CRM profile (contract dates, revenue inputs,
   * specialties) that nothing here looks at.
   */
  async nameMap(
    ctx: TenantContext,
    opts?: { includeDeleted?: boolean },
    tx?: ScopedTx,
  ): Promise<Map<string, string>> {
    const clients = await db(ctx, tx).client.findMany({
      where: opts?.includeDeleted ? {} : { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: REFERENCE_ROWS_CAP,
    });
    return new Map(clients.map((c) => [c.id, c.name]));
  },

  // --- Wave 4.2 (CRM) ---------------------------------------------------

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).client.findUnique({ where: { id } });
  },

  create(ctx: TenantContext, data: SeamWrite<Prisma.ClientUncheckedCreateInput>, tx?: ScopedTx) {
    return db(ctx, tx).client.create({ data: scopedWrite(data) });
  },

  update(ctx: TenantContext, id: string, data: Prisma.ClientUncheckedUpdateInput, tx?: ScopedTx) {
    return db(ctx, tx).client.update({ where: { id }, data });
  },

  /**
   * Active-contact counts per client, in ONE `groupBy` — feeds the `/crm` list's "N contacts"
   * column without an N+1 count-per-client query.
   */
  async contactCounts(ctx: TenantContext, tx?: ScopedTx): Promise<Map<string, number>> {
    const rows = await db(ctx, tx).clientContact.groupBy({
      by: ["clientId"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.clientId, r._count._all]));
  },
};
