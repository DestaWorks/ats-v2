import "server-only";
import type { NoteDTO } from "@/lib/validation/candidate";
import type { NoteType } from "@/lib/constants";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { noteRepository, type NoteRow } from "@/server/repositories/note.repository";
import { AppError } from "@/server/http/app-error";
import { toIso } from "@/lib/utils/iso";

/** Minimal viewer shape the note scope needs (kept structural for a future client-portal viewer). */
export interface NoteViewer {
  id: string;
  name: string;
}

/**
 * Server-authoritative note visibility. Runs in the READ (never client-side — the legacy bug
 * shipped hidden notes to the browser). v1: every authenticated operator sees BOTH `internal` and
 * `external` notes (all six roles are internal staff). Centralized here as a pure function so the
 * future client-portal viewer (external-only) is a one-line change — the DTO/route/page never move.
 */
export function visibleNotes(notes: NoteRow[], _viewer: NoteViewer): NoteRow[] {
  void _viewer;
  return notes;
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
   * missing/soft-deleted candidate), then atomically writes the note + an audit row. `authorId`/
   * `authorName` come from the SERVER session — never the client body (the legacy took `author`
   * from the client).
   */
  async add(candidateId: string, input: AddNoteServiceInput, user: AuthUser): Promise<NoteDTO> {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");

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
      await writeAudit(tx, {
        entity: "candidate",
        entityId: candidateId,
        actor: user.id,
        action: "add_note",
        after: { noteId: note.id, noteType: note.noteType },
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
