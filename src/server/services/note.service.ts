import "server-only";
import type { NoteDTO } from "@/lib/validation/candidate";
import { hasCapability, type NoteType, type Role } from "@/lib/constants";
import { resolveMentions, type MentionTarget } from "@/lib/mentions";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { mentionRepository } from "@/server/repositories/mention.repository";
import { noteRepository, type NoteRow } from "@/server/repositories/note.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";
import { toIso } from "@/lib/utils/iso";
import { sendEmail } from "@/server/email/provider";
import { mentionEmail } from "@/server/email/templates/mention";

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

/** Best-effort email notification for each mentioned recipient — the in-app mention row (already
 *  written) is the source of truth; this is on top of it, never a blocker. A recipient with no
 *  resolvable email (or any lookup/send failure) is silently skipped — a mentioned teammate still
 *  sees the alert bell either way. */
async function notifyMentioned(
  recipients: MentionTarget[],
  ctx: { candidateId: string; candidateName: string; body: string; authorName: string },
): Promise<void> {
  try {
    const emails = await userRepository.emailsByIds(recipients.map((r) => r.id));
    const url = new URL(
      `/candidates/${ctx.candidateId}?tab=notes`,
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    ).toString();
    await Promise.all(
      recipients.map((r) => {
        const email = emails.get(r.id);
        if (!email) return undefined;
        const { subject, html, text } = mentionEmail({
          name: r.name,
          authorName: ctx.authorName,
          candidateName: ctx.candidateName,
          body: ctx.body,
          url,
        });
        return sendEmail({ to: email, subject, html, text }).catch(() => undefined);
      }),
    );
  } catch {
    // Never let a lookup/send failure surface as a note-add failure.
  }
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

    // Best-effort, AFTER the transaction commits — a mentioned teammate is already notified
    // in-app via the mention row above regardless, so an unconfigured/failed send here (or a
    // recipient with no resolvable email) never turns a successful note-add into an error.
    // AWAITED (not fire-and-forget): a serverless function's process can be frozen/recycled the
    // instant the response returns, which would silently drop an un-awaited send mid-flight.
    if (recipients.length > 0) {
      await notifyMentioned(recipients, {
        candidateId,
        candidateName: candidate.name,
        body: input.body,
        authorName: user.name,
      });
    }

    return toNoteDTO(created);
  },

  /** List a candidate's notes, server-scoped by `visibleNotes`, mapped to DTOs (newest-first). */
  async listByCandidate(candidateId: string, viewer: NoteViewer): Promise<NoteDTO[]> {
    const notes = await noteRepository.listByCandidate(candidateId);
    return visibleNotes(notes, viewer).map(toNoteDTO);
  },
};
