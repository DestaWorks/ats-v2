import type { TenantContext } from "@destaworks/domain/tenant";
import type { SavedView } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";

/** A raw saved-view row (Prisma model). Services/DTOs map this to API shapes. */
export type SavedViewRow = SavedView;

/**
 * Saved-view data access (Wave 2.1 closeout) — the ONLY layer that touches Prisma for saved
 * views. Personal, per-user rows — every read/write is scoped by `userId`; the service never
 * trusts a client-supplied owner. Hard delete (no soft-delete column — see the model's doc
 * comment in `prisma/schema.prisma`).
 */
export const savedViewRepository = {
  /** A user's saved views for one scope (pipeline/candidates), oldest-first. */
  listByUser(ctx: TenantContext, userId: string, scope: string, tx?: ScopedTx) {
    return db(ctx, tx).savedView.findMany({
      where: { userId, scope },
      orderBy: { createdAt: "asc" },
    });
  },

  findByUserScopeName(
    ctx: TenantContext,
    userId: string,
    scope: string,
    name: string,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).savedView.findFirst({ where: { userId, scope, name } });
  },

  create(
    ctx: TenantContext,
    data: { userId: string; scope: string; name: string; query: string },
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).savedView.create({ data });
  },

  /** Scoped delete — `id` AND `userId` must both match, so this IS the ownership boundary
   *  (never trust a client-supplied id alone). `count === 0` means "not found or not yours". */
  deleteOwned(ctx: TenantContext, id: string, userId: string, tx?: ScopedTx) {
    return db(ctx, tx).savedView.deleteMany({ where: { id, userId } });
  },
};
