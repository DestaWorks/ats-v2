import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma } from "../generated/prisma/client";
import { db, type ScopedTx } from "../tenant-scope";
import { REFERENCE_ROWS_CAP } from "../query-limits";

/**
 * Client-match-profile data access (Wave 3.5) — the active-matcher weight overrides, one row per
 * client. Mirrors `clientRulesRepository`: the table is tiny, so callers fetch what they need by
 * client id (or all, for a batch map) rather than joining per lead/role row.
 */
export const clientMatchProfileRepository = {
  findByClientId(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientMatchProfile.findUnique({ where: { clientId } });
  },

  list(ctx: TenantContext, tx?: ScopedTx) {
    return db(ctx, tx).clientMatchProfile.findMany({ take: REFERENCE_ROWS_CAP });
  },

  /** Upsert-on-save (legacy `cp_save` — one row per client, no separate create/update actions). */
  upsert(
    ctx: TenantContext,
    clientId: string,
    data: Omit<Prisma.ClientMatchProfileUncheckedCreateInput, "clientId">,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).clientMatchProfile.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
    });
  },

  delete(ctx: TenantContext, clientId: string, tx?: ScopedTx) {
    return db(ctx, tx).clientMatchProfile.delete({ where: { clientId } });
  },
};
