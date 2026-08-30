import type { TenantContext } from "@destaworks/domain/tenant";
import type { Prisma } from "../generated/prisma/client";
import { db, type ScopedTx, scopedWrite } from "../tenant-scope";

/**
 * The `migration_runs` table (Phase 5) — the durable record of one asynchronous ETL commit.
 *
 * Deliberately dumb: it holds no lifecycle rules, only the writes the run service and the job
 * handler compose. The one piece of logic that lives here is the conditional claim below, because
 * it can only be expressed as a `WHERE` on the update.
 */

export interface MigrationRunCreateInput {
  checksum: string;
  format: string;
  filename?: string | null;
  extractWithAi: boolean;
  content: string;
  /** The staged resume texts, already validated against the contract schema by the caller. */
  resumes: unknown;
  startedById: string;
}

/** Cleared staged input. An empty array rather than SQL NULL so the column keeps one shape and
 *  readers never branch on "absent" vs "none". */
const NO_RESUMES: Prisma.InputJsonValue = [];

export const migrationRunRepository = {
  create(ctx: TenantContext, data: MigrationRunCreateInput, tx?: ScopedTx) {
    // `as`: see `finish` below — the same JSON conversion at the same boundary.
    const resumes = (data.resumes ?? NO_RESUMES) as Prisma.InputJsonValue;
    return db(ctx, tx).migrationRun.create({ data: scopedWrite({ ...data, resumes }) });
  },

  findById(ctx: TenantContext, id: string, tx?: ScopedTx) {
    return db(ctx, tx).migrationRun.findUnique({ where: { id } });
  },

  setJobId(ctx: TenantContext, id: string, jobId: string, tx?: ScopedTx) {
    return db(ctx, tx).migrationRun.update({ where: { id }, data: { jobId } });
  },

  /**
   * Take ownership of a run for one attempt and return it — or `null` when another attempt already
   * owns it, or the run has finished.
   *
   * The `status` predicate is what makes a duplicate delivery safe: two workers handed the same
   * job both issue this update and Postgres lets exactly one of them match, so the loser sees a
   * count of 0 and stops without ever reading the staged input, let alone writing a candidate. A
   * run left `running` by a crashed worker is re-claimable — `running` and `interrupted` are both
   * in the predicate — because the queue's attempt bound, not this row, is what stops a genuinely
   * stuck job from cycling forever.
   */
  async claimForAttempt(ctx: TenantContext, id: string, attempt: number, now: Date, tx?: ScopedTx) {
    const client = db(ctx, tx);
    const { count } = await client.migrationRun.updateMany({
      where: { id, status: { in: ["queued", "running", "interrupted"] } },
      data: { status: "running", attempt, startedAt: now },
    });
    if (count === 0) return null;
    return client.migrationRun.findUnique({ where: { id } });
  },

  recordProgress(
    ctx: TenantContext,
    id: string,
    processedRows: number,
    totalRows: number,
    tx?: ScopedTx,
  ) {
    return db(ctx, tx).migrationRun.update({
      where: { id },
      data: { processedRows, totalRows },
    });
  },

  /**
   * Move a run to a terminal state. The staged input is cleared in the same write: it exists only
   * to feed the attempts, and once there will be no more attempts it is a copy of candidate PII
   * with no reader.
   */
  finish(
    ctx: TenantContext,
    id: string,
    data: { status: "succeeded" | "failed"; report?: unknown; failureCode?: string },
    now: Date,
    tx?: ScopedTx,
  ) {
    // `as`: the caller's report is a plain JSON-serializable object, but TypeScript cannot prove an
    // arbitrary interface satisfies `InputJsonValue`'s recursive shape. Same conversion, and same
    // reason, as `writeAudit`'s before/after — the db layer is where it belongs.
    const report = data.report as Prisma.InputJsonValue | undefined;
    return db(ctx, tx).migrationRun.update({
      where: { id },
      data: {
        status: data.status,
        ...(report !== undefined && { report }),
        failureCode: data.failureCode ?? null,
        finishedAt: now,
        content: null,
        resumes: NO_RESUMES,
      },
    });
  },

  /**
   * An attempt stopped at a row boundary; the staged input stays put for the retry. `processedRows`
   * is omitted when the attempt failed before it knew how far it had got — the marker already on
   * the row is then the best answer, and overwriting it with 0 would make the retry redo work.
   */
  markInterrupted(ctx: TenantContext, id: string, processedRows?: number, tx?: ScopedTx) {
    return db(ctx, tx).migrationRun.update({
      where: { id },
      data: { status: "interrupted", ...(processedRows !== undefined && { processedRows }) },
    });
  },
};
