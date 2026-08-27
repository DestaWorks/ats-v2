import "server-only";
import { hasCapability, type Role } from "@destaworks/domain/constants";
import type { DocumentRow } from "@destaworks/db/repositories/document.repository";

/** Minimal viewer shape the DTO needs — only the role drives the PII gate. */
export interface DtoViewer {
  role: Role;
}

/**
 * THE PUBLISHED SURFACE: the document columns every viewer may see, named one by one. This list
 * — not the Prisma model — decides what leaves the server, so a column added to `Document` is
 * published to nobody until someone adds it here. Every column must be classified here, in
 * `DOCUMENT_GATED_FIELDS`, or in `DOCUMENT_WITHHELD_FIELDS`; `dto-published-surface.test.ts`
 * fails on any column that is in none of them.
 */
export const DOCUMENT_PUBLISHED_FIELDS = [
  "id",
  "legacyId",
  "candidateId",
  "type",
  "originalFilename",
  "mimeType",
  "sizeBytes",
  "storageKey",
  "legacyUrl",
  "uploadedById",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deletedById",
] as const satisfies readonly (keyof DocumentRow)[];

/**
 * Columns published ONLY to a viewer holding `viewCredentials`. These are the MOST sensitive
 * fields in the app — licenseNumber, NPI, DEA, full contact + employment PII lifted off a resume.
 */
export const DOCUMENT_GATED_FIELDS = [
  "extractedText",
  "extractedData",
] as const satisfies readonly (keyof DocumentRow)[];

/** Columns no viewer ever receives, at any capability. */
export const DOCUMENT_WITHHELD_FIELDS = [] as const satisfies readonly (keyof DocumentRow)[];

type DocumentPublishedField = (typeof DOCUMENT_PUBLISHED_FIELDS)[number];
type DocumentGatedField = (typeof DOCUMENT_GATED_FIELDS)[number];
type DocumentWithheldField = (typeof DOCUMENT_WITHHELD_FIELDS)[number];

/** Resolves to `never` only when every document column is classified above; a new, undeclared
 *  column resolves to its own name and fails the `AssertNoUnclassified` constraint at typecheck. */
type UnclassifiedDocumentColumn = Exclude<
  keyof DocumentRow,
  DocumentPublishedField | DocumentGatedField | DocumentWithheldField
>;
type AssertNoUnclassified<T extends never> = T;
export type DocumentColumnsAllClassified = AssertNoUnclassified<UnclassifiedDocumentColumn>;

/**
 * Document as exposed to a viewer: exactly `DOCUMENT_PUBLISHED_FIELDS`, plus `extractedText` /
 * `extractedData` only when the viewer holds `viewCredentials`.
 */
export type DocumentDTO = Pick<DocumentRow, DocumentPublishedField> &
  Partial<Pick<DocumentRow, DocumentGatedField>>;

/**
 * Map a document row to its DTO. THE PII BOUNDARY: fields are copied one by one (never spread off
 * the row), so an unlisted column cannot ride along, and `extractedData`/`extractedText` are
 * omitted — keys absent, not null — unless the viewer has `viewCredentials`. Mirrors the
 * candidate `licenseNumber` gate.
 */
export function toDocumentDTO(row: DocumentRow, viewer: DtoViewer): DocumentDTO {
  const dto: DocumentDTO = {
    id: row.id,
    legacyId: row.legacyId,
    candidateId: row.candidateId,
    type: row.type,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    legacyUrl: row.legacyUrl,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedById: row.deletedById,
  };
  if (hasCapability(viewer.role, "viewCredentials")) {
    dto.extractedText = row.extractedText;
    dto.extractedData = row.extractedData;
  }
  return dto;
}
