import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Document } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { decryptField, encryptField, isEncryptionEnabled } from "@/server/db/field-crypto";

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

const ENC_PREFIX = "enc:v1:";

/**
 * FIELD ENCRYPTION BOUNDARY (see `server/db/field-crypto`). `extractedText` and `extractedData` are
 * the heaviest PII/PHI surface in the app; both are encrypted at rest when `FIELD_ENCRYPTION_KEY`
 * is set (no-op passthrough otherwise). `extractedData` is JSON, so we STRINGIFY it before
 * encrypting and store the resulting `enc:v1:` string in the Json column; on read we decrypt then
 * `JSON.parse`. Reads are mixed-safe via the prefix, so services/DTOs only ever see plaintext.
 */
function encryptText<T extends string | null | undefined>(value: T): T {
  if (typeof value === "string" && !value.startsWith(ENC_PREFIX)) return encryptField(value) as T;
  return value;
}

/**
 * Encrypt a JSON payload for storage. Key ON → stringify+encrypt to an `enc:v1:` string; key OFF →
 * store the NATIVE object unchanged. (Stringifying in the no-key path would round-trip object→string
 * and permanently corrupt the shape — B1.) `decryptJson` reads both: prefixed→parse, native→as-is.
 */
function encryptJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "string" && value.startsWith(ENC_PREFIX)) return value; // already encrypted
  if (!isEncryptionEnabled()) return value as Prisma.InputJsonValue; // passthrough: store native JSON
  return encryptField(JSON.stringify(value));
}

/** Decrypt an `extractedData` value read back from the Json column (mixed plaintext/ciphertext). */
function decryptJson(value: Prisma.JsonValue): Prisma.JsonValue {
  if (typeof value === "string" && value.startsWith(ENC_PREFIX)) {
    return JSON.parse(decryptField(value)) as Prisma.JsonValue;
  }
  return value; // legacy object/array/plain-string/null — as-is
}

/** Decrypt the sensitive fields on a document row read back from the DB (passthrough when null). */
function decryptRow<T extends Document | null>(row: T): T {
  if (!row) return row;
  return {
    ...row,
    extractedText: row.extractedText === null ? null : decryptField(row.extractedText),
    extractedData: row.extractedData === null ? null : decryptJson(row.extractedData),
  };
}

/**
 * Document data access — the ONLY layer that touches Prisma for documents (Wave 1.2).
 *
 * SOFT DELETE: like the candidate repository, reads add `deletedAt: null` unless `includeDeleted`
 * is set, so soft-deleted rows never surface by accident. Every method accepts an optional `tx`
 * so the résumé service can compose the candidate write + document write + audit atomically.
 */
export const documentRepository = {
  async create(data: DocumentCreateData, tx?: Prisma.TransactionClient) {
    const { extractedData, extractedText, ...rest } = data;
    return decryptRow(
      await db(tx).document.create({
        data: {
          ...rest,
          extractedText: encryptText(extractedText),
          extractedData: encryptJson(extractedData),
        },
      }),
    );
  },

  async findById(id: string, opts?: { includeDeleted?: boolean }, tx?: Prisma.TransactionClient) {
    return decryptRow(
      await db(tx).document.findFirst({
        where: { id, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      }),
    );
  },

  /**
   * ETL-ONLY, intentionally delete-agnostic (mirrors the candidate repo): returns a soft-deleted
   * row too so the one-shot migration re-upserts an existing document instead of duplicating it.
   */
  async findByLegacyId(legacyId: string, tx?: Prisma.TransactionClient) {
    return decryptRow(await db(tx).document.findUnique({ where: { legacyId } }));
  },

  /** ETL upsert keyed on the legacy Sheet ResumeFileID — idempotent re-runs (Wave 1.3 §5). */
  async upsertByLegacyId(
    legacyId: string,
    data: DocumentCreateData,
    tx?: Prisma.TransactionClient,
  ) {
    const { extractedData, extractedText, ...rest } = data;
    const text = encryptText(extractedText);
    const json = encryptJson(extractedData);
    return decryptRow(
      await db(tx).document.upsert({
        where: { legacyId },
        create: { ...rest, legacyId, extractedText: text, extractedData: json },
        update: { ...rest, extractedText: text, extractedData: json },
      }),
    );
  },

  async listByCandidate(candidateId: string, tx?: Prisma.TransactionClient) {
    const rows = await db(tx).document.findMany({
      where: { candidateId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(decryptRow);
  },

  async softDelete(id: string, actorId: string, tx?: Prisma.TransactionClient) {
    return decryptRow(
      await db(tx).document.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: actorId },
      }),
    );
  },
};
