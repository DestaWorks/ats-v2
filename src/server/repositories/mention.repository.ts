import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/prisma";

/** A mention row joined with the context the alerts panel renders (author, type, candidate). */
export type MentionRow = Prisma.MentionGetPayload<{ include: typeof MENTION_INCLUDE }>;

const MENTION_INCLUDE = {
  note: {
    select: {
      authorId: true,
      authorName: true,
      noteType: true,
      body: true,
      candidate: { select: { name: true } },
    },
  },
} as const;

/**
 * Mention data access — the ONLY layer that touches Prisma for mentions. Rows are created
 * server-side alongside the note (same `tx`); the read side powers the bell badge + alerts
 * panel (`recipientId + readAt` is the indexed pair).
 */
export const mentionRepository = {
  /** Insert one row per recipient (already resolved + deduped by the service). */
  async createMany(
    data: { noteId: string; candidateId: string; recipientIds: string[] },
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (data.recipientIds.length === 0) return 0;
    const res = await db(tx).mention.createMany({
      data: data.recipientIds.map((recipientId) => ({
        noteId: data.noteId,
        candidateId: data.candidateId,
        recipientId,
      })),
    });
    return res.count;
  },

  /** The viewer's mentions, newest first (unread + recent read; the service slices for display). */
  listForRecipient(recipientId: string, take: number, tx?: Prisma.TransactionClient) {
    return db(tx).mention.findMany({
      where: { recipientId, note: { deletedAt: null } },
      include: MENTION_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
  },

  /** Unread count for the bell badge. */
  countUnread(recipientId: string, tx?: Prisma.TransactionClient) {
    return db(tx).mention.count({
      where: { recipientId, readAt: null, note: { deletedAt: null } },
    });
  },

  /**
   * Mark ONE mention read. Scoped to the recipient (`updateMany`, not `update`) so a caller can
   * never mark someone else's mention; returns the affected count (0 → not yours / not found).
   */
  async markRead(id: string, recipientId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const res = await db(tx).mention.updateMany({
      where: { id, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  },

  /** Mark ALL of the recipient's unread mentions read; returns the affected count. */
  async markAllRead(recipientId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const res = await db(tx).mention.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  },
};
