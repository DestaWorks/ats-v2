/**
 * Document + résumé-variant vocabulary (Wave 1.2).
 * Isomorphic constants — safe to import from client and server. Business logic lives elsewhere
 * (`server/ai/parse-resume`, `server/services`). Stored as `String` in Postgres (vocab out of
 * migrations), validated against these unions in zod.
 */
import type { Track } from "./candidate";

/** What a stored `documents` row is. */
export const DOCUMENT_TYPES = ["resume", "license", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(v: string): v is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(v);
}

/**
 * The résumé layout / extraction variant chosen at upload (the legacy "role picker").
 * DISTINCT from the app `Role` enum (Owner/Director/…) — this selects the parse schema + render
 * layout, and maps onto the candidate `Track`.
 */
export const RESUME_VARIANTS = ["clinical", "prescriber", "operations"] as const;
export type ResumeVariant = (typeof RESUME_VARIANTS)[number];

export function isResumeVariant(v: string): v is ResumeVariant {
  return (RESUME_VARIANTS as readonly string[]).includes(v);
}

/** Résumé variant → candidate track. */
export const VARIANT_TO_TRACK: Record<ResumeVariant, Track> = {
  clinical: "Clinical",
  prescriber: "Prescriber",
  operations: "Operations",
};

/** Human labels for the upload picker (copy mirrors the legacy ROLES). */
export const RESUME_VARIANT_LABELS: Record<ResumeVariant, string> = {
  clinical: "Clinical",
  prescriber: "Prescriber (MD/DO/NP)",
  operations: "Operations",
};
