import { z } from "zod";
import { logger } from "@destaworks/config/logger";
import { CommitAbortedError, migrationService } from "@destaworks/application/migration.service";
import { migrationRunService } from "@destaworks/application/migration-run.service";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { JobDefinition, JobHandler } from "../queue";

/**
 * `migration.commit` — the legacy Sheet → Postgres ETL, off the request path (Phase 5).
 *
 * The payload is the run id and nothing else. The upload itself (up to 10 MB of CSV plus resume
 * text) lives on the `migration_runs` row, so a retry, a dead-letter record and a queue dump all
 * stay small, and the handler reads the same input every attempt.
 */

export const migrationCommitPayloadSchema = z.object({ runId: z.string().min(1) }).strict();
export type MigrationCommitPayload = z.infer<typeof migrationCommitPayloadSchema>;

/**
 * `maxAttempts: 2` — exactly one automatic retry.
 *
 * The floor is 1 rather than 0 because the failure this job actually suffers is environmental: a
 * worker redeployed mid-run, a dropped database connection, an attempt that outran its budget.
 * Those are transient and the retry costs nothing incorrect — every row is upserted on `legacy_id`
 * and the run resumes from `processedRows`, so a second attempt neither duplicates a candidate nor
 * redoes work already done.
 *
 * The ceiling is 1 rather than 5 because a second failure is almost never transient. Past that the
 * cause is deterministic — a malformed export, a vocabulary the transform does not recognise, a
 * schema that moved — and repeating a minutes-long import of candidate PII unattended buys nothing
 * and costs audit noise, database load, and (with `extractWithAi`) paid LLM calls on every pass.
 * A partial import is expensive to reason about, so the third outcome should be a human reading
 * the run record, not a fourth machine attempt.
 *
 * `timeoutMs: 30 min` is a deliberate multiple of the 5-minute ceiling the Next.js route lived
 * under — the whole point of moving the work — while still being a bound, so a wedged attempt
 * releases its worker slot and hands the run back for its one retry.
 */
export const migrationCommitJob: JobDefinition<MigrationCommitPayload> = {
  name: "migration.commit",
  schema: migrationCommitPayloadSchema,
  maxAttempts: 2,
  timeoutMs: 30 * 60_000,
};

/** Persist progress at most this often. Every row would add a write per row to a job whose whole
 *  problem is how many rows it writes; a stale-by-seconds counter is enough to tell slow from stuck. */
const PROGRESS_PERSIST_INTERVAL_MS = 2_000;

/**
 * One attempt at one run.
 *
 * Its contract with the queue is: return normally when the run reached a terminal state (success,
 * or a failure with no attempts left), and throw when the run should be tried again. Everything a
 * human needs afterwards is on the run row, not in this function's return value.
 */
export const handleMigrationCommit: JobHandler<MigrationCommitPayload> = async (ctx) => {
  const { runId } = ctx.payload;
  const log = logger.child({ runId, job: migrationCommitJob.name });

  let lastPersistedAt = 0;
  /** Rows this attempt is known to have finished. `null` until a claim says where it starts, which
   *  is the difference between "resume from 0" and "we never found out — keep the stored marker". */
  let processedRows: number | null = null;

  // The claim is inside the try on purpose: it is the step that flips the run to `running`, so a
  // failure after it — a deleted actor, an unreadable staged payload — would otherwise leave the
  // run stuck in `running` forever with nothing recorded about why.
  try {
    const claimed = await migrationRunService.claim(runId, ctx.attempt);

    // Null means the run already finished, or another worker holds it. A duplicate delivery lands
    // here and stops without writing anything — the claim is a conditional update, so exactly one
    // attempt can win it.
    if (!claimed) {
      log.info("migration.commit.skipped", { attempt: ctx.attempt });
      return;
    }

    log.info("migration.commit.started", {
      attempt: ctx.attempt,
      resumeFromRow: claimed.resumeFromRow,
    });
    processedRows = claimed.resumeFromRow;

    const report = await migrationService.commit(claimed.input, claimed.actor, {
      signal: ctx.signal,
      resumeFromRow: claimed.resumeFromRow,
      onProgress: async (done, total) => {
        processedRows = done;
        await ctx.reportProgress(done, total);
        const now = Date.now();
        if (now - lastPersistedAt < PROGRESS_PERSIST_INTERVAL_MS) return;
        lastPersistedAt = now;
        // Progress is an observability aid, not part of the import. A failed counter write must
        // not fail rows that already committed.
        await migrationRunService.recordProgress(runId, done, total).catch(() => {
          log.warn("migration.commit.progress_write_failed", { processedRows: done });
        });
      },
    });

    await migrationRunService.succeed(runId, report);
    log.info("migration.commit.finished", { counts: report.counts });
    return;
  } catch (err) {
    if (err instanceof CommitAbortedError) {
      // Stopped at a row boundary. The rows before this point are committed and the run resumes
      // from them, so this is a retry, not a failure — rethrow to let the queue count the attempt.
      await migrationRunService.interrupt(runId, err.processedRows);
      throw err;
    }

    const failureCode = err instanceof AppError ? err.code : "INTERNAL";
    const lastAttempt = ctx.attempt >= migrationCommitJob.maxAttempts;

    // Only the final attempt closes the run. Marking it `failed` earlier would clear the staged
    // upload the retry still needs, and would tell an operator the import is over while a worker
    // is about to start it again.
    if (lastAttempt) {
      await migrationRunService.fail(runId, failureCode);
    } else if (processedRows === null) {
      await migrationRunService.interrupt(runId);
    } else {
      await migrationRunService.interrupt(runId, processedRows);
    }

    // Never log the error's message: this ETL's failures quote the row that caused them.
    log.error("migration.commit.attempt_failed", {
      attempt: ctx.attempt,
      failureCode,
      processedRows,
      final: lastAttempt,
    });
    throw err;
  }
};
