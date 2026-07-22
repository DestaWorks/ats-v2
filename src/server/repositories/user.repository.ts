import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

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

  /**
   * All users as `{ id, name }` options, sorted by name — feeds the "view as owner" filter
   * dropdown. Display names only (no email/PII); the user table is small (fixed team).
   */
  list(tx?: Prisma.TransactionClient) {
    return db(tx).user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  },

  /** Wave 4.1 (Templates) — one user's signature + sticky note. */
  findPreferences(userId: string, tx?: Prisma.TransactionClient) {
    return db(tx).user.findUnique({
      where: { id: userId },
      select: { emailSignature: true, stickyNote: true },
    });
  },

  /** Own-record only (callers always pass the session user's own id). */
  updatePreferences(
    userId: string,
    data: { emailSignature?: string | null; stickyNote?: string | null },
    tx?: Prisma.TransactionClient,
  ) {
    return db(tx).user.update({
      where: { id: userId },
      data,
      select: { emailSignature: true, stickyNote: true },
    });
  },
};
