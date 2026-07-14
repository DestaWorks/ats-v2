import "server-only";
import type { ClientMatchProfile, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** A raw client-match-profile row (Prisma model). */
export type ClientMatchProfileRow = ClientMatchProfile;

function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * Client-match-profile data access (Wave 3.5) — the active-matcher weight overrides, one row per
 * client. Mirrors `clientRulesRepository`: the table is tiny, so callers fetch what they need by
 * client id (or all, for a batch map) rather than joining per lead/role row.
 */
export const clientMatchProfileRepository = {
  findByClientId(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientMatchProfile.findUnique({ where: { clientId } });
  },

  list(tx?: Prisma.TransactionClient) {
    return db(tx).clientMatchProfile.findMany();
  },

  /** Upsert-on-save (legacy `cp_save` — one row per client, no separate create/update actions). */
  upsert(
    clientId: string,
    data: Omit<Prisma.ClientMatchProfileUncheckedCreateInput, "clientId">,
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).clientMatchProfile.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
    });
  },

  delete(clientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).clientMatchProfile.delete({ where: { clientId } });
  },
};
