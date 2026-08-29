import { logger } from "@destaworks/config/logger";
import { systemClock, type Clock } from "@destaworks/domain/clock";
import { AppError } from "@destaworks/integrations/http/app-error";
import { reportExportService } from "@destaworks/application/reports/report-export.service";
import type { JobContext, JobHandler } from "../queue";
import { reportExportJob, type ReportExportJobPayload } from "../definitions/report-export.job";

/**
 * Runs one CSV export off the request path.
 *
 * Deliberately thin. Building the CSV and storing it is `reportExportService.fulfil` — the same
 * `exportService.candidatesCsv` the synchronous route still calls, so the two paths cannot drift
 * into producing different files. What belongs HERE is only what is true of a job and not of a
 * request: the abort signal, and what to do on the last attempt.
 *
 * On failure the error is rethrown so the queue can retry it; on the FINAL attempt the export is
 * marked `failed` first, so the browser polling it is told to stop waiting instead of spinning on
 * `pending` forever against a job that has already been dead-lettered.
 */
export function createReportExportHandler(
  clock: Clock = systemClock,
): JobHandler<ReportExportJobPayload> {
  return async (ctx: JobContext<ReportExportJobPayload>): Promise<void> => {
    const { exportId, filters } = ctx.payload;
    // The deadline may already have passed while this attempt waited for a worker slot; the
    // cohort query is minutes of work, so it is worth not starting one that cannot be delivered.
    ctx.signal.throwIfAborted();
    // An export id and an attempt number: no filter values, no candidate data. A filter can name
    // a client or a recruiter, and the CSV itself is PII — neither ever reaches a log line.
    logger.info("reports.export.started", { exportId, attempt: ctx.attempt });
    try {
      await reportExportService.fulfil(exportId, filters, clock.now());
    } catch (err) {
      if (ctx.attempt >= reportExportJob.maxAttempts) {
        const code = err instanceof AppError ? err.code : "INTERNAL";
        await reportExportService.fail(exportId, code);
        logger.error("reports.export.dead_lettered", { exportId, errorCode: code });
      }
      throw err;
    }
  };
}

export const reportExportHandler: JobHandler<ReportExportJobPayload> = createReportExportHandler();
