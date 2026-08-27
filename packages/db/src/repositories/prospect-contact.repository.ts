import type { Prisma, ProspectContact } from "../generated/prisma/client";
import { db } from "../prisma";

/** A raw prospect-contact row (Prisma model). */
export type ProspectContactRow = ProspectContact;

/**
 * Prospect-contact data access — the ONLY layer that touches Prisma for enriched/manually-added
 * contacts at a prospect. Scoped mutations (`update`/`softDelete` take `prospectId` + `id`) use
 * `updateMany`/`deleteMany` so an id belonging to another prospect is a 0-row no-op, never a
 * cross-prospect write — mirrors `leadRepository.updateOutreachAttempt`/`deleteOutreachAttempt`.
 */
export const prospectContactRepository = {
  create(data: Prisma.ProspectContactUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    return db(tx).prospectContact.create({ data });
  },

  createMany(rows: Prisma.ProspectContactCreateManyInput[], tx?: Prisma.TransactionClient) {
    return db(tx).prospectContact.createMany({ data: rows });
  },

  /** A prospect's contacts, newest-first. */
  listByProspect(prospectId: string, tx?: Prisma.TransactionClient) {
    return db(tx).prospectContact.findMany({
      where: { prospectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Delete one contact, scoped to its prospect. Returns the affected count. */
  async softDelete(prospectId: string, contactId: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).prospectContact.updateMany({
      where: { id: contactId, prospectId },
      data: { deletedAt: new Date() },
    });
    return count;
  },
};
