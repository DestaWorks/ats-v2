import { toRole } from "@destaworks/domain/constants";
import {
  importFormatSchema,
  isMigrationRunStatus,
  stagedImportResumesSchema,
  type ImportInput,
  type ImportReport,
  type MigrationCommitAccepted,
  type MigrationRunState,
} from "@destaworks/contracts/validation/migration";
import type { TenantContext } from "@destaworks/domain/tenant";
import { logger } from "@destaworks/config/logger";
import { membershipReader } from "@destaworks/db/memberships";
import { migrationRunRepository } from "@destaworks/db/repositories/migration-run.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import { assertCanImport, contentChecksum } from "./migration.service";
import { requireMigrationCommitEnqueuer } from "./migration-commit.port";

/**
 * The lifecycle of one asynchronous ETL commit (Phase 5): stage the upload, hand it to the queue,
 * and answer "where is it" afterwards.
 *
 * This exists as its own service because the commit split in two. `migration.service` still owns
 * the ETL — parse, transform, upsert — and knows nothing about queues or runs. This one owns the
 * run record and the two ends that touch it: an HTTP caller (start, read status) and a job handler
 * (claim, report progress, finish). Keeping the ETL free of both is what lets the handler test
 * drive the real import with nothing but repository fakes.
 */

/** What the handler needs to execute one attempt. */
export interface ClaimedMigrationRun {
  runId: string;
  attempt: number;
  input: ImportInput;
  actor: TenantContext;
  /** Writable rows a previous attempt already committed. 0 on a first attempt. */
  resumeFromRow: number;
  totalRows: number;
}

/** A run row's `resumes` column. Re-validated on read rather than trusted: it left the process as
 *  JSON and, on a resumed attempt, was written by a different deployment than the one reading it. */
function parseStagedResumes(value: unknown): ImportInput["resumes"] {
  const parsed = stagedImportResumesSchema.safeParse(value ?? []);
  if (!parsed.success) {
    throw new AppError("INTERNAL", "The staged import could not be read.");
  }
  return parsed.data.length > 0 ? parsed.data : undefined;
}

/** The shape `migrationRunRepository` returns; narrowed to what this service reads. */
interface RunRow {
  id: string;
  jobId: string | null;
  status: string;
  attempt: number;
  processedRows: number;
  totalRows: number;
  checksum: string;
  format: string;
  filename: string | null;
  extractWithAi: boolean;
  content: string | null;
  resumes: unknown;
  report: unknown;
  failureCode: string | null;
  startedById: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

function toState(run: RunRow): MigrationRunState {
  return {
    runId: run.id,
    jobId: run.jobId,
    // Every value in this column is written by this service from the contract's own union, so an
    // unknown one means the row was tampered with or the union shrank under a deployed row.
    // Reporting it as `failed` is the safe read: it stops a poller rather than looping forever.
    status: isMigrationRunStatus(run.status) ? run.status : "failed",
    attempt: run.attempt,
    processedRows: run.processedRows,
    totalRows: run.totalRows,
    checksum: run.checksum,
    filename: run.filename,
    queuedAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    updatedAt: run.updatedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    failureCode: run.failureCode,
    // `as`: the column is only ever written from a typed `ImportReport` a few lines below in this
    // same file — it is never client-supplied — so there is no untrusted shape to validate here,
    // and Prisma's `JsonValue` cannot express that provenance.
    report: (run.report as ImportReport | null) ?? null,
  };
}

export const migrationRunService = {
  /**
   * Stage an upload and queue it. Returns as soon as the job is accepted — the import has not
   * started, and the caller polls `state()` for the outcome.
   *
   * The run row is written BEFORE the enqueue and the job id recorded after, rather than both in
   * one transaction, because the queue port's transactional enqueue takes the caller's `tx` and
   * this service has no queue to hand one to — that is the runner's side of the port. The failure
   * this leaves open is a staged run whose enqueue threw, which is visible (`queued`, no `jobId`)
   * and re-queueable, unlike the opposite order, which would hand a worker a run id that does not
   * exist yet.
   */
  async start(ctx: TenantContext, input: ImportInput): Promise<MigrationCommitAccepted> {
    assertCanImport(ctx);

    const run = await migrationRunRepository.create(ctx, {
      checksum: contentChecksum(input.content),
      format: input.format,
      filename: input.filename ?? null,
      extractWithAi: input.extractWithAi ?? false,
      content: input.content,
      resumes: input.resumes ?? [],
      startedById: ctx.user.id,
    });

    const jobId = await requireMigrationCommitEnqueuer()(run.id, ctx.tenantId);
    await migrationRunRepository.setJobId(ctx, run.id, jobId);

    logger.info("migration.run.queued", { runId: run.id, jobId, actorId: ctx.user.id });
    return { runId: run.id, jobId, status: "queued" };
  },

  /** The operator's read. Same `bulkImport` gate as starting one — a run report lists candidates. */
  async state(ctx: TenantContext, runId: string): Promise<MigrationRunState> {
    assertCanImport(ctx);
    const run = await migrationRunRepository.findById(ctx, runId);
    if (!run) throw new AppError("NOT_FOUND", "Import run not found");
    return toState(run);
  },

  /**
   * Take one attempt at a run, or return `null` if there is nothing to do (already finished, or
   * another worker holds it). Called only by the job handler.
   *
   * The actor is re-read rather than restored from the request: a job can run long after the
   * session that queued it, and a user who lost `bulkImport` in between must not have an import
   * still running under the old grant. A deleted or demoted actor fails the run.
   *
   * Both halves of the context are re-derived, not just the identity. The tenant comes from the
   * run row — the job is work for one tenant and must stay in it however the queue is drained —
   * and the role from that tenant's membership. A worker is the one place with no request to
   * resolve a tenant from, so it is also the one place where "which tenant" could silently become
   * "whichever the actor happens to default to"; reading it from the row it is doing work for is
   * what stops that. A run staged before 6.2's backfill carries no tenant and cannot be resumed.
   */
  async claim(
    ctx: TenantContext,
    runId: string,
    attempt: number,
  ): Promise<ClaimedMigrationRun | null> {
    const run = await migrationRunRepository.claimForAttempt(ctx, runId, attempt, new Date());
    if (!run) return null;
    if (run.content === null) {
      throw new AppError("INTERNAL", "The staged import is no longer available.");
    }
    if (run.tenantId === null) {
      throw new AppError("INTERNAL", "The staged import is not attributed to a workspace.");
    }

    const actorRow = await userRepository.findActorById(run.startedById);
    const membership = (await membershipReader.listActiveForUser(run.startedById)).find(
      (m) => m.tenantId === run.tenantId,
    );
    if (!actorRow || !membership) {
      throw new AppError("FORBIDDEN", "The account that started this import can no longer run it.");
    }
    const actor: TenantContext = {
      tenantId: membership.tenantId,
      membershipId: membership.id,
      user: { id: actorRow.id, email: actorRow.email, name: actorRow.name },
      role: toRole(membership.role),
    };
    assertCanImport(actor);

    const resumes = parseStagedResumes(run.resumes);
    const input: ImportInput = {
      format: importFormatSchema.parse(run.format),
      content: run.content,
      checksum: run.checksum,
      ...(run.filename !== null && { filename: run.filename }),
      ...(run.extractWithAi && { extractWithAi: true }),
      ...(resumes && { resumes }),
    };

    return {
      runId: run.id,
      attempt,
      input,
      actor,
      resumeFromRow: run.processedRows,
      totalRows: run.totalRows,
    };
  },

  recordProgress(ctx: TenantContext, runId: string, done: number, total: number): Promise<unknown> {
    return migrationRunRepository.recordProgress(ctx, runId, done, total);
  },

  async succeed(ctx: TenantContext, runId: string, report: ImportReport): Promise<void> {
    await migrationRunRepository.finish(ctx, runId, { status: "succeeded", report }, new Date());
    logger.info("migration.run.succeeded", { runId, counts: report.counts });
  },

  /** The attempt stopped short; the queue will retry it from `processedRows`. Omit that argument
   *  when the attempt failed before it knew how far it got — the marker already on the row wins. */
  async interrupt(ctx: TenantContext, runId: string, processedRows?: number): Promise<void> {
    await migrationRunRepository.markInterrupted(ctx, runId, processedRows);
    logger.warn("migration.run.interrupted", { runId, processedRows: processedRows ?? null });
  },

  /** No attempts left. `failureCode` is a code, never a message — a message can quote a row. */
  async fail(ctx: TenantContext, runId: string, failureCode: string): Promise<void> {
    await migrationRunRepository.finish(ctx, runId, { status: "failed", failureCode }, new Date());
    logger.error("migration.run.failed", { runId, failureCode });
  },
};
