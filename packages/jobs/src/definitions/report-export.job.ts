import { reportExportPayloadSchema } from "@destaworks/contracts/validation/reports";
import type { JobDefinition, JobPayload } from "../queue";

/**
 * The CSV export job (Phase 5, "Move brief generation and CSV export to jobs").
 *
 * The definition is separate from the handler so the two can be imported independently: an
 * enqueuing controller needs the name, schema and limits and must NOT pull in the handler's
 * transitive dependencies (the export cohort query, object storage) just to put a row on a queue.
 */
export const reportExportJob = {
  // A wire contract — in-flight jobs are addressed by it, so it survives refactors of this file.
  name: "reports.export.candidates",
  schema: reportExportPayloadSchema,
  /**
   * Three attempts. The work is idempotent (the same filters produce the same CSV, written to
   * the same key, overwriting), so a retry after a transient storage or database failure is
   * always safe — and a fourth attempt at a cohort query that has failed three times is not a
   * transient failure, it is a bug or a query too big to run.
   */
  maxAttempts: 3,
  /**
   * Five minutes. Deliberately far beyond what a request may take — that ceiling is the reason
   * this job exists — but still bounded, so a pathological cohort cannot hold a worker slot
   * forever. It matches `maxDuration = 300` only by coincidence of both being "long but finite".
   */
  timeoutMs: 300_000,
} satisfies JobDefinition<unknown>;

export type ReportExportJobPayload = JobPayload<typeof reportExportJob>;
