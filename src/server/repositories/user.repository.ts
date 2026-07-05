import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** Resolve the client to use — the transaction client when composing reads, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * Minimal read access to the Better Auth `User` table for resolving actor ids → display names.
 * The ONLY layer that touches Prisma for users. Kept intentionally small + reusable: the same
 * `namesByIds` also serves stage-history / notes actor-name resolution later. Reads no PII beyond
 * the display name.
 */
export const userRepository = {
  /**
   * Batch-resolve a set of user ids to their display names in ONE query. De-dupes the input,
   * short-circuits on an empty set (no query), and returns a `Map<id, name>` — callers fall back
   * to a placeholder ("Unknown") for an id absent from the map (e.g. a since-removed user).
   */
  async namesByIds(ids: string[], tx?: Prisma.TransactionClient): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await db(tx).user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name] as const));
  },
};
