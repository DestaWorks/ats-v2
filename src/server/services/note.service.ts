import "server-only";
import type { NoteDTO } from "@/lib/validation/candidate";
import { hasCapability, type NoteType, type Role } from "@/lib/constants";
import { resolveMentions } from "@/lib/mentions";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { mentionRepository } from "@/server/repositories/mention.repository";
import { noteRepository, type NoteRow } from "@/server/repositories/note.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";
import { toIso } from "@/lib/utils/iso";

/** Minimal viewer shape the note scope needs (kept structural for a future client-portal viewer). */
export interface NoteViewer {
  id: string;
  name: string;
  role: Role;
}

/**
 * Server-authoritative note visibility. Runs in the READ (never client-side — the legacy bug
 * shipped hidden notes to the browser and filtered there). Legacy rule, capability-mapped:
 * `internal` notes are readable by every operator; the other four types (`client`/`call`/
 * `email`/`text`) require `viewAllNoteTypes` (legacy: the literal `admin` role; target: the
 * Owner/Admin tier). Centralized as a pure function so a future client-portal viewer is a
 * one-line change — the DTO/route/page never move.
 */
export function visibleNotes(notes: NoteRow[], viewer: NoteViewer): NoteRow[] {
  if (hasCapability(viewer.role, "viewAllNoteTypes")) return notes;
  return notes.filter((n) => n.noteType === "internal");
}

/** Project a note row to its wire DTO. No PII gate — body is text; author is a name/id. */
export function toNoteDTO(row: NoteRow): NoteDTO {
  return {
    id: row.id,
    body: row.body,
    noteType: row.noteType as NoteType,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: toIso(row.createdAt),
  };
}

/** Input for adding a note (already zod-validated at the route boundary). */
export interface AddNoteServiceInput {
  body: string;
  noteType: NoteType;
}

/**
 * Note business logic. Owns authZ + DTO shape; the repository owns Prisma. Note bodies are stored
 * RAW — the XSS defense is at RENDER (escaped React children, never `dangerouslySetInnerHTML`), so
 * there is intentionally NO server-side HTML stripping (that would corrupt legitimate text).
 */
export const noteService = {
  /**
   * Add a note to a candidate. Verifies the candidate exists first (a note can't attach to a
   * missing/soft-deleted candidate), then atomically writes the note + its mention rows + an
   * audit row. `authorId`/`authorName` come from the SERVER session — never the client body
   * (the legacy took `author` from the client). Mentions are re-derived HERE from the stored
   * body against the real user table (the legacy `ats_notify_mention` trusted a client-supplied
   * recipient list); self-mentions are dropped.
   */
  async add(candidateId: string, input: AddNoteServiceInput, user: AuthUser): Promise<NoteDTO> {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");
    const users = await userRepository.list();
    const recipients = resolveMentions(input.body, users).filter((u) => u.id !== user.id);

    const created = await withTransaction(async (tx) => {
      const note = await noteRepository.create(
        {
          candidateId,
          authorId: user.id,
          authorName: user.name,
          body: input.body, // stored RAW — escaped at render, never as HTML
          noteType: input.noteType,
        },
        tx,
      );
      await mentionRepository.createMany(
        { noteId: note.id, candidateId, recipientIds: recipients.map((r) => r.id) },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: candidateId,
        actor: user.id,
        action: "add_note",
        after: { noteId: note.id, noteType: note.noteType, mentioned: recipients.map((r) => r.id) },
      });
      return note;
    });

    return toNoteDTO(created);
  },

  /** List a candidate's notes, server-scoped by `visibleNotes`, mapped to DTOs (newest-first). */
  async listByCandidate(candidateId: string, viewer: NoteViewer): Promise<NoteDTO[]> {
    const notes = await noteRepository.listByCandidate(candidateId);
    return visibleNotes(notes, viewer).map(toNoteDTO);
  },
};
