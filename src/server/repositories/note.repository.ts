import "server-only";
import type { CandidateNote, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** A raw candidate-note row (Prisma model). Services/DTOs map this to API shapes. */
export type NoteRow = CandidateNote;

/** Domain input for creating a note. `authorId`/`authorName` come from the server session. */
export interface NoteCreateData {
  candidateId: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  noteType: string;
  legacyId?: string | null;
}

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * Candidate-note data access — the ONLY layer that touches Prisma for notes (Wave 2.2).
 *
 * SOFT DELETE: like the candidate/document repositories, reads add `deletedAt: null` so
 * soft-deleted notes never surface by accident. Every method accepts an optional `tx` so the
 * note service can compose the note write + `writeAudit` atomically.
 */
export const noteRepository = {
  create(data: NoteCreateData, tx?: Prisma.TransactionClient) {
    return db(tx).candidateNote.create({
      data: {
        candidateId: data.candidateId,
        authorId: data.authorId,
        authorName: data.authorName ?? null,
        body: data.body,
        noteType: data.noteType,
        legacyId: data.legacyId ?? null,
      },
    });
  },

  listByCandidate(candidateId: string, tx?: Prisma.TransactionClient) {
    return db(tx).candidateNote.findMany({
      where: { candidateId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  softDelete(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return db(tx).candidateNote.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },

  /** ETL upsert keyed on the legacy Sheet note id — deferred (mirrors the document repo). */
  upsertByLegacyId(legacyId: string, data: NoteCreateData, tx?: Prisma.TransactionClient) {
    const create = {
      candidateId: data.candidateId,
      authorId: data.authorId,
      authorName: data.authorName ?? null,
      body: data.body,
      noteType: data.noteType,
      legacyId,
    };
    return db(tx).candidateNote.upsert({
      where: { legacyId },
      create,
      update: {
        authorName: data.authorName ?? null,
        body: data.body,
        noteType: data.noteType,
      },
    });
  },
};
