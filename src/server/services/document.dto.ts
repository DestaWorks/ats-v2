import "server-only";
import { hasCapability, type Role } from "@/lib/constants";
import type { DocumentRow } from "@/server/repositories/document.repository";

/** Minimal viewer shape the DTO needs — only the role drives the PII gate. */
export interface DtoViewer {
  role: Role;
}

/**
 * Document as exposed to a viewer. `extractedData` and `extractedText` (the MOST sensitive fields
 * in the app — licenseNumber, NPI, DEA, full contact + employment PII) are present only when the
 * viewer holds `viewCredentials`.
 */
export type DocumentDTO = Omit<DocumentRow, "extractedData" | "extractedText"> & {
  extractedData?: DocumentRow["extractedData"];
  extractedText?: DocumentRow["extractedText"];
};

/**
 * Map a document row to its DTO. THE PII BOUNDARY: `extractedData`/`extractedText` are omitted
 * unless the viewer has `viewCredentials`. Mirrors the candidate `licenseNumber` gate.
 */
export function toDocumentDTO(row: DocumentRow, viewer: DtoViewer): DocumentDTO {
  const { extractedData, extractedText, ...rest } = row;
  if (hasCapability(viewer.role, "viewCredentials")) {
    return { ...rest, extractedData, extractedText };
  }
  return rest;
}
