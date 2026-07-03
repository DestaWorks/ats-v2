import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * Run `fn` inside a single Prisma transaction, passing the transactional client (`tx`).
 *
 * Every repository method accepts an optional `tx`, so a service can compose several writes
 * (e.g. a candidate `update` + a `stage_history` insert + `writeAudit`) into one atomic unit
 * — the audit trail can never drift from the data it records. On any throw the transaction
 * rolls back.
 */
export function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
