import type { TenantContext } from "@destaworks/domain/tenant";
import type { CandidateNote } from "../generated/prisma/client";
import { bridgeUnscopedCallers, db, type ScopedTx } from "../tenant-scope";

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

/**
 * Candidate-note data access — the ONLY layer that touches Prisma for notes (Wave 2.2).
 *
 * SOFT DELETE: like the candidate/document repositories, reads add `deletedAt: null` so
 * soft-deleted notes never surface by accident. Every method accepts an optional `tx` so the
 * note service can compose the note write + `writeAudit` atomically.
 */
export const noteRepository = bridgeUnscopedCallers({
  create(ctx: TenantContext, data: NoteCreateData, tx?: ScopedTx) {
    return db(ctx, tx).candidateNote.create({
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

  listByCandidate(ctx: TenantContext, candidateId: string, tx?: ScopedTx) {
    return db(ctx, tx).candidateNote.findMany({
      where: { candidateId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  softDelete(ctx: TenantContext, id: string, actorId: string, tx?: ScopedTx) {
    return db(ctx, tx).candidateNote.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },

  /** ETL upsert keyed on the legacy Sheet note id — deferred (mirrors the document repo). */
  upsertByLegacyId(ctx: TenantContext, legacyId: string, data: NoteCreateData, tx?: ScopedTx) {
    const create = {
      candidateId: data.candidateId,
      authorId: data.authorId,
      authorName: data.authorName ?? null,
      body: data.body,
      noteType: data.noteType,
      legacyId,
    };
    return db(ctx, tx).candidateNote.upsert({
      where: { legacyId },
      create,
      update: {
        authorName: data.authorName ?? null,
        body: data.body,
        noteType: data.noteType,
      },
    });
  },
});
