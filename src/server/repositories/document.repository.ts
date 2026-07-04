import "server-only";
import type { Document, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** A raw document row (Prisma model). Services/DTOs map this to API shapes. */
export type DocumentRow = Document;

/**
 * Domain input for creating a document. `extractedData` is typed `unknown` so callers pass the
 * structured résumé object directly; the repository casts it to the Prisma JSON input at this
 * boundary (keeping Prisma types confined to the repository layer).
 */
export interface DocumentCreateData {
  candidateId?: string | null;
  legacyId?: string | null;
  type?: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes?: number | null;
  storageKey?: string | null;
  legacyUrl?: string | null;
  extractedText?: string | null;
  extractedData?: unknown;
  uploadedById?: string | null;
}

/** Resolve the client to use — the transaction client when composing writes, else the singleton. */
function db(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

/**
 * Document data access — the ONLY layer that touches Prisma for documents (Wave 1.2).
 *
 * SOFT DELETE: like the candidate repository, reads add `deletedAt: null` unless `includeDeleted`
 * is set, so soft-deleted rows never surface by accident. Every method accepts an optional `tx`
 * so the résumé service can compose the candidate write + document write + audit atomically.
 */
export const documentRepository = {
  create(data: DocumentCreateData, tx?: Prisma.TransactionClient) {
    const { extractedData, ...rest } = data;
    return db(tx).document.create({
      data: { ...rest, extractedData: extractedData as Prisma.InputJsonValue },
    });
  },

  findById(id: string, opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return db(tx).document.findFirst({
      where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    });
  },

  listByCandidate(candidateId: string, tx?: Prisma.TransactionClient) {
    return db(tx).document.findMany({
      where: { candidateId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  softDelete(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return db(tx).document.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
  },
};
