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
};
