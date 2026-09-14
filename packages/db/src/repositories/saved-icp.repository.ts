import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma, SavedIcp } from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";
import { CHILD_ROWS_CAP, REFERENCE_ROWS_CAP } from "../query-limits";

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
  listByUser(ctx: TenantContext, userId: string, tx?: ScopedTx) {
    return db(ctx, tx).savedIcp.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Every ICP visible to the app (private + shared) — the service filters to `!isPrivate ||
   *  own`, matching the reference UI's "team-shared by default, private toggle" behavior. */
  listAll(ctx: TenantContext, tx?: ScopedTx) {
    return db(ctx, tx).savedIcp.findMany({
      orderBy: { createdAt: "desc" },
      take: REFERENCE_ROWS_CAP,
    });
  },

  findByUserAndName(ctx: TenantContext, userId: string, name: string, tx?: ScopedTx) {
    return db(ctx, tx).savedIcp.findFirst({ where: { userId, name } });
  },

  create(ctx: TenantContext, data: SeamWrite<Prisma.SavedIcpUncheckedCreateInput>, tx?: ScopedTx) {
    return db(ctx, tx).savedIcp.create({ data: scopedWrite(data) });
  },

  /** Scoped delete — `id` AND `userId` must both match, so this IS the ownership boundary
   *  (never trust a client-supplied id alone). `count === 0` means "not found or not yours". */
  deleteOwned(ctx: TenantContext, id: string, userId: string, tx?: ScopedTx) {
    return db(ctx, tx).savedIcp.deleteMany({ where: { id, userId } });
  },
};
