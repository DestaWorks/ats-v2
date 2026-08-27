import "server-only";
import type { Client, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw client row (Prisma model). */
export type ClientRow = Client;

/**
 * Client data access — the ONLY layer that touches Prisma for clients. The `clients` table is
 * small (a handful of accounts), so the board read fetches them all once and builds an
 * `id → name` map rather than joining per candidate row (see `candidateService.listBoard`).
 * Soft-deleted rows are excluded by default (mirrors the candidate repository contract).
 */
export const clientRepository = {
  list(opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return db(tx).client.findMany({
      where: opts?.includeDeleted ? {} : { deletedAt: null },
      orderBy: { name: "asc" },
    });
  },

  /**
   * The `id → name` map every list/board/detail read builds from `list()` — pulled out since it
   * was hand-rolled (`new Map(clients.map((c) => [c.id, c.name]))`) at 14 call sites across 5
   * services. Same `includeDeleted`/`tx` passthrough as `list()`.
   */
  async nameMap(
    opts?: { includeDeleted?: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, string>> {
    const clients = await clientRepository.list(opts, tx);
    return new Map(clients.map((c) => [c.id, c.name]));
  },

  // --- Wave 4.2 (CRM) ---------------------------------------------------

  findById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).client.findUnique({ where: { id } });
  },

  create(data: Prisma.ClientUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).client.create({ data });
  },

  update(id: string, data: Prisma.ClientUncheckedUpdateInput, tx?: Prisma.TransactionClient) {
    return db(tx).client.update({ where: { id }, data });
  },

  /**
   * Active-contact counts per client, in ONE `groupBy` — feeds the `/crm` list's "N contacts"
   * column without an N+1 count-per-client query.
   */
  async contactCounts(tx?: Prisma.TransactionClient): Promise<Map<string, number>> {
    const rows = await db(tx).clientContact.groupBy({
      by: ["clientId"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.clientId, r._count._all]));
  },
};
