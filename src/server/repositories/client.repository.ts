import "server-only";
import type { Client, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** A raw client row (Prisma model). */
export type ClientRow = Client;

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

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
};
