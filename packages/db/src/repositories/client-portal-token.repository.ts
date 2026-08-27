import "server-only";
import type { Prisma } from "../generated/prisma/client";
import { db } from "../prisma";

/**
 * Client-portal-token data access (Wave 4.3) — the ONLY layer that touches Prisma for
 * `ClientPortalToken`. Only `tokenHash` is ever persisted (see `client-portal.service.ts`); this
 * repository never sees or returns a raw token.
 */
export const clientPortalTokenRepository = {
  create(
    data: { contactId: string; tokenHash: string; expiresAt: Date; createdById?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).clientPortalToken.create({ data });
  },

  findByHash(tokenHash: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientPortalToken.findUnique({
      where: { tokenHash },
      include: { contact: true },
    });
  },

  findById(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientPortalToken.findUnique({
      where: { id },
      include: { contact: true },
    });
  },

  findActiveForContact(contactId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientPortalToken.findFirst({
      where: { contactId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Batched `findActiveForContact` for a set of contacts — perf audit 2026-08-16: the admin
   *  Client Portal management page was issuing one query per contact. Only one active token per
   *  contact can exist at a time (`revokeAllForContact` enforces it), so this returns at most one
   *  row per `contactId` already; no `orderBy`/dedup needed on the caller's side. */
  findActiveForContacts(contactIds: string[], tx?: Prisma.TransactionClient) {
    if (contactIds.length === 0) return Promise.resolve([]);
    return db(tx).clientPortalToken.findMany({
      where: { contactId: { in: contactIds }, revokedAt: null },
    });
  },

  listForContact(contactId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientPortalToken.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Revokes every currently-active token for a contact (used before minting a new one — one live
   *  link per contact at a time). */
  revokeAllForContact(contactId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientPortalToken.updateMany({
      where: { contactId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async revoke(id: string, tx?: Prisma.TransactionClient) {
    const { count } = await db(tx).clientPortalToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  },

  touchLastUsed(id: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientPortalToken.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },
};
