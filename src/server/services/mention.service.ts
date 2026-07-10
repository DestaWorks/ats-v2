import "server-only";
import type { NoteType } from "@/lib/constants";
import type { MentionDTO, MentionListDTO } from "@/lib/validation/mention";
import type { AuthUser } from "@/server/auth/guards";
import { mentionRepository, type MentionRow } from "@/server/repositories/mention.repository";
import { AppError } from "@/server/http/app-error";
import { toIso } from "@/lib/utils/iso";

/** Rows the panel lists (unread + a tail of recent read; the badge count is separate/true). */
const MENTIONS_PAGE = 20;
const EXCERPT_MAX = 140;

/** Project a joined mention row to its wire DTO (excerpt truncated, dates ISO). */
function toMentionDTO(row: MentionRow): MentionDTO {
  const body = row.note.body;
  return {
    id: row.id,
    candidateId: row.candidateId,
    candidateName: row.note.candidate.name,
    authorName: row.note.authorName,
    noteType: row.note.noteType as NoteType,
    excerpt: body.length > EXCERPT_MAX ? `${body.slice(0, EXCERPT_MAX - 1)}…` : body,
    createdAt: toIso(row.createdAt),
    readAt: row.readAt ? toIso(row.readAt) : null,
  };
}

/**
 * Mention read-side business logic (`ats_get_mentions` / `ats_mark_mention_read` parity). The
 * recipient is ALWAYS the session user — a caller can only ever list or mark their own mentions.
 * Being mentioned intentionally grants reading the tagged note's excerpt regardless of note-type
 * visibility (legacy parity: the notification carried the full text).
 */
export const mentionService = {
  /** The viewer's recent mentions (newest first) + the true unread badge count. */
  async listMine(user: AuthUser): Promise<MentionListDTO> {
    const [rows, unread] = await Promise.all([
      mentionRepository.listForRecipient(user.id, MENTIONS_PAGE),
      mentionRepository.countUnread(user.id),
    ]);
    return { mentions: rows.map(toMentionDTO), unread };
  },

  /**
   * Mark one mention (`mentionId`) or all of the viewer's mentions (`all: true`) read. Marking
   * someone else's mention id is a NOT_FOUND (the repo scopes the update to the recipient).
   * Marking an already-read mention is a no-op success (idempotent). Returns the fresh unread
   * count so the bell can re-render without a second round trip.
   */
  async markRead(
    input: { mentionId: string | null; all: boolean },
    user: AuthUser,
  ): Promise<{ unread: number }> {
    if (input.all) {
      await mentionRepository.markAllRead(user.id);
    } else {
      const count = await mentionRepository.markRead(input.mentionId!, user.id);
      if (count === 0) {
        // Distinguish "not yours / missing" from "already read" (idempotent success).
        const mine = await mentionRepository.listForRecipient(user.id, MENTIONS_PAGE);
        if (!mine.some((m) => m.id === input.mentionId)) {
          throw new AppError("NOT_FOUND", "Mention not found");
        }
      }
    }
    return { unread: await mentionRepository.countUnread(user.id) };
  },
};
