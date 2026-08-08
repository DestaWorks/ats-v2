import "server-only";
import type { Prisma, SavedIcp } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A raw saved-ICP row (Prisma model). Services/DTOs map this to API shapes. */
export type SavedIcpRow = SavedIcp;

/**
 * Saved-ICP data access — the ONLY layer that touches Prisma for Client Discovery's saved
 * searches. Personal, per-user rows — every read/write is scoped by `userId`; the service never
 * trusts a client-supplied owner. Mirrors `savedViewRepository` (hard delete, no soft-delete
 * column — a saved search has nothing worth restoring from trash).
 */
export const savedIcpRepository = {
  /** A user's saved ICPs (own private ones + everyone's shared ones), newest-first — the
   *  service applies the private/shared visibility filter, this just reads by user for the
   *  owned-name-uniqueness check and `listAll` covers the shared feed. */
  listByUser(userId: string, tx?: Prisma.TransactionClient) {
    return db(tx).savedIcp.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Every ICP visible to the app (private + shared) — the service filters to `!isPrivate ||
   *  own`, matching the reference UI's "team-shared by default, private toggle" behavior. */
  listAll(tx?: Prisma.TransactionClient) {
    return db(tx).savedIcp.findMany({ orderBy: { createdAt: "desc" } });
  },

  findByUserAndName(userId: string, name: string, tx?: Prisma.TransactionClient) {
    return db(tx).savedIcp.findFirst({ where: { userId, name } });
  },

  create(data: Prisma.SavedIcpUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).savedIcp.create({ data });
  },

  /** Scoped delete — `id` AND `userId` must both match, so this IS the ownership boundary
   *  (never trust a client-supplied id alone). `count === 0` means "not found or not yours". */
  deleteOwned(id: string, userId: string, tx?: Prisma.TransactionClient) {
    return db(tx).savedIcp.deleteMany({ where: { id, userId } });
  },
};
