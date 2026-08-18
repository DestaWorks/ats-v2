/**
 * Bulk-import / candidate ETL contract (Wave 1.3, Module 20) — the isomorphic interface shared
 * by the migration service, the API routes, and the client wizard. Pure types + zod (no server
 * imports), so the frontend imports the same request schema and report shapes the server produces.
 *
 * See `docs/design/wave-1.3-etl.md`. A one-shot Sheet→Postgres import: upload a CSV/JSON export of
 * the legacy candidate Sheet → `prepare` (parse + transform + dedupe + a diffable report, ZERO
 * writes) → `commit` (idempotent upsert keyed on `legacy_id`). Re-running never duplicates.
 */
import { z } from "zod";

/** Upper bound on the uploaded text body (recruiter-scale exports are low-thousands of rows). */
export const MAX_IMPORT_BYTES = 10_000_000;

/** CSV is the primary input, JSON secondary (E-1). */
export const importFormatSchema = z.enum(["csv", "json"]);
export type ImportFormat = z.infer<typeof importFormatSchema>;

/**
 * One resume pulled from the optional bulk-import ZIP (Indrasur flow) — already unzipped and
 * pdf.js-extracted to text CLIENT-SIDE (same as the single-resume flow, `resume/lib/pdf-extract.ts`
 * — no binary ever reaches the server). `filenamePrefix` is the ZIP entry's name up to the first
 * `_`, lowercased/trimmed — the correlation key matched against each row's `name` server-side.
 */
export const importResumeSchema = z.object({
  filenamePrefix: z.string().trim().min(1).max(200),
  /** The full ZIP entry filename (e.g. "Jane Carter_resume.pdf") — shown in the match-preview
   *  report so a reviewer can see WHICH file matched, not just that one did (legacy parity). */
  originalFilename: z.string().trim().min(1).max(255),
  text: z.string().min(1).max(60_000),
  /** Set client-side (Wave 6) once the raw PDF bytes have already been PUT directly to Storage via
   *  a signed URL — the server never receives the binary itself, only this key. Absent when Storage
   *  isn't configured or the upload failed; the resume still attaches, just without a stored file. */
  storageKey: z.string().max(500).optional(),
});
export type ImportResume = z.infer<typeof importResumeSchema>;

/** Combined resume-text payload cap — conservative, safely under Vercel's default serverless body
 *  limit (this is ON TOP OF the CSV/JSON `content`, so the two caps are independent). */
export const MAX_IMPORT_RESUMES = 300;

/**
 * POST /api/migration/{prepare,commit} — request body. `content` is the raw CSV/JSON text (the
 * client reads the file). `checksum` (sha256, hex) is an advisory prepare→commit hand-off (E-7):
 * commit recomputes it and, on mismatch, appends a NON-blocking warning (legacy_id upsert makes a
 * re-parse safe). Stateless: no parsed batch is parked server-side.
 *
 * `resumes`/`extractWithAi` (Wave 1.3 backlog, the "Indrasur" bulk-resume flow) are OPTIONAL and
 * independent of the base CSV/JSON import — a request with neither behaves exactly as before.
 */
export const importInputSchema = z.object({
  format: importFormatSchema,
  // Hard cap on the request body — a clear, actionable error beats an opaque platform 413.
  content: z
    .string()
    .min(1, "The import file is empty.")
    .max(
      MAX_IMPORT_BYTES,
      "The import file is too large (max 10 MB). Split it and import in batches.",
    ),
  filename: z.string().min(1).max(255).optional(),
  checksum: z.string().length(64).optional(),
  resumes: z.array(importResumeSchema).max(MAX_IMPORT_RESUMES).optional(),
  /** Explicit opt-in — each matched resume is a paid, rate-limited LLM call. Omitted/false = off. */
  extractWithAi: z.boolean().optional(),
});
export type ImportInput = z.infer<typeof importInputSchema>;

/**
 * Per-row disposition. `prepare` reports what commit WOULD do; `commit` reports what it DID.
 * A row can be added/updated AND flagged — `flagged` is a separate count over rows with reasons.
 */
export type ImportAction = "add" | "update" | "softDelete" | "skip" | "error";

/** Whether a bulk-import row's resume (if any were uploaded) was attached — always present so the
 *  UI can render a consistent column; `"none"` when no resume ZIP was uploaded at all. */
export type ResumeMatchStatus = "matched" | "ambiguous" | "none";

/** One row in the report — the diffable surface (no PII beyond the name already shown in-app). */
export interface ImportRowReport {
  legacyId: string;
  name: string;
  action: ImportAction;
  /** Machine-readable codes: flags ("unknown-client", "email-duplicate"), errors
   *  ("unrecognized-status", "missing-id"), and non-blocking notes ("unmapped-credential",
   *  "resume-ambiguous", "ai-extraction-failed"). */
  reasons: string[];
  resumeMatch: ResumeMatchStatus;
  /** The matched resume's original filename — set only when `resumeMatch === "matched"`. */
  resumeFilename?: string;
}

/** A suspected same-person collision: >1 distinct legacy row sharing an email (E-4, D8). */
export interface EmailDuplicateGroup {
  email: string;
  legacyIds: string[];
  /** The keep-newest primary (greatest UpdatedAt). No row is dropped/merged — all import. */
  keptLegacyId: string;
}

export interface ImportCounts {
  added: number;
  updated: number;
  softDeleted: number;
  skipped: number;
  flagged: number;
  errored: number;
}

/** The prepare/commit result (same shape for both, so §1.4 can diff staging vs prod vs the Sheet). */
export interface ImportReport {
  counts: ImportCounts;
  /** FULL, deterministically ordered by legacyId — the stable diff surface. */
  rows: ImportRowReport[];
  emailDuplicateGroups: EmailDuplicateGroup[];
  /** sha256 of the parsed content (E-7 hand-off). */
  checksum: string;
  /** Non-blocking advisories (e.g. "checksum-mismatch"). Present only when non-empty. */
  warnings?: string[];
  /** Uploaded resume filenames whose prefix matched NO row's name — full visibility, never
   *  silently dropped (unlike legacy's orphaned Drive-staging files). Present only when non-empty. */
  unmatchedResumeFiles?: string[];
  /** Resume-match tally across all rows (legacy parity — "Resumes matched"/"No resume found" stats).
   *  Present only when a resume ZIP was actually part of the request; absent when the import is
   *  CSV/JSON-only, so the UI never shows a misleading "0 matched" for imports with no resumes at all. */
  resumeCounts?: { matched: number; ambiguous: number; none: number };
}
