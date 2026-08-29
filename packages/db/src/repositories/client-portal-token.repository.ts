import type { TenantContext } from "@destaworks/domain/tenant";
import { bridgeUnscopedCallers, db, type ScopedTx } from "../tenant-scope";

/**
 * Client-portal-token data access (Wave 4.3) — the ONLY layer that touches Prisma for
 * `ClientPortalToken`. Only `tokenHash` is ever persisted (see `client-portal.service.ts`); this
 * repository never sees or returns a raw token.
 */
export const clientPortalTokenRepository = bridgeUnscopedCallers({
  create(
    ctx: TenantContext,
    data: { contactId: string; tokenHash: string; expiresAt: Date; createdById?: string },
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).clientPortalToken.create({ data });
  },

  findByHash(ctx: TenantContext, tokenHash: string, tx?: ScopedTx) {
    return db(ctx, tx).clientPortalToken.findUnique({
      where: { tokenHash },
      include: { contact: true },
    });
  },

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).clientPortalToken.findUnique({
      where: { id },
      include: { contact: true },
    });
  },

  findActiveForContact(ctx: TenantContext, contactId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientPortalToken.findFirst({
      where: { contactId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Batched `findActiveForContact` for a set of contacts — perf audit 2026-08-16: the admin
   *  Client Portal management page was issuing one query per contact. Only one active token per
   *  contact can exist at a time (`revokeAllForContact` enforces it), so this returns at most one
   *  row per `contactId` already; no `orderBy`/dedup needed on the caller's side. */
  findActiveForContacts(ctx: TenantContext, contactIds: string[], tx?: ScopedTx) {
    if (contactIds.length === 0) return Promise.resolve([]);
    return db(ctx, tx).clientPortalToken.findMany({
      where: { contactId: { in: contactIds }, revokedAt: null },
    });
  },

  listForContact(ctx: TenantContext, contactId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientPortalToken.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Revokes every currently-active token for a contact (used before minting a new one — one live
   *  link per contact at a time). */
  revokeAllForContact(ctx: TenantContext, contactId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientPortalToken.updateMany({
      where: { contactId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async revoke(ctx: TenantContext, id: string, tx?: ScopedTx) {
    const { count } = await db(ctx, tx).clientPortalToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  },

  touchLastUsed(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).clientPortalToken.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  },
});
