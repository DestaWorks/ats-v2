import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma, ProspectContact } from "../generated/prisma/client";
import { db, type ScopedTx, type SeamWrite, scopedWrite } from "../tenant-scope";
import { CHILD_ROWS_CAP } from "../query-limits";

/** A raw prospect-contact row (Prisma model). */
export type ProspectContactRow = ProspectContact;

/**
 * Prospect-contact data access — the ONLY layer that touches Prisma for enriched/manually-added
 * contacts at a prospect. Scoped mutations (`update`/`softDelete` take `prospectId` + `id`) use
 * `updateMany`/`deleteMany` so an id belonging to another prospect is a 0-row no-op, never a
 * cross-prospect write — mirrors `leadRepository.updateOutreachAttempt`/`deleteOutreachAttempt`.
 */
export const prospectContactRepository = {
  create(
    ctx: TenantContext,
    data: SeamWrite<Prisma.ProspectContactUncheckedCreateInput>,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).prospectContact.create({ data: scopedWrite(data) });
  },

  createMany(
    ctx: TenantContext,
    rows: SeamWrite<Prisma.ProspectContactCreateManyInput>[],
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).prospectContact.createMany({ data: rows.map(scopedWrite) });
  },

  /** A prospect's contacts, newest-first. */
  listByProspect(ctx: TenantContext, prospectId: string, tx?: ScopedTx) {
    return db(ctx, tx).prospectContact.findMany({
      where: { prospectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CHILD_ROWS_CAP,
    });
  },

  /** Delete one contact, scoped to its prospect. Returns the affected count. */
  async softDelete(ctx: TenantContext, prospectId: string, contactId: string, tx?: ScopedTx) {
    const { count } = await db(ctx, tx).prospectContact.updateMany({
      where: { id: contactId, prospectId },
      data: { deletedAt: new Date() },
    });
    return count;
  },
};
