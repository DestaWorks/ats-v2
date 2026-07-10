/**
 * Mention contract — the isomorphic interface shared by the mentions read/mark-read routes and
 * the bell/alerts client. Pure types + zod (NO server imports). Wire dates are ISO strings.
 */
import { z } from "zod";
import type { NoteType } from "@/lib/constants";

/** One "@you" notification row the bell/alerts panel renders. */
export interface MentionDTO {
  id: string;
  candidateId: string; // deep link → /candidates/:id (notes tab)
  candidateName: string;
  authorName: string | null;
  noteType: NoteType;
  /** Short excerpt of the note body (being mentioned grants reading what you were tagged in). */
  excerpt: string;
  createdAt: string; // ISO
  readAt: string | null; // ISO; null = unread (drives the bell badge)
}

/** The `GET /api/mentions` payload. `unread` is the badge count (may exceed listed rows). */
export interface MentionListDTO {
  mentions: MentionDTO[];
  unread: number;
}

/**
 * Body for `POST /api/mentions/read` — exactly one of: `{ mentionId }` (mark one) or
 * `{ all: true }` (mark all). The recipient is ALWAYS the session user, never a body field.
 */
export const markMentionReadSchema = z
  .union([
    z.object({ mentionId: z.string().min(1) }).strict(),
    z.object({ all: z.literal(true) }).strict(),
  ])
  .transform((v) =>
    "mentionId" in v
      ? { mentionId: v.mentionId, all: false as const }
      : { mentionId: null, all: true as const },
  );
export type MarkMentionReadInput = z.infer<typeof markMentionReadSchema>;
