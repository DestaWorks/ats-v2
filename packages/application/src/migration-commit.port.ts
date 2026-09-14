import { AppError } from "@destaworks/integrations/http/app-error";

/**
 * The seam through which a request hands the ETL commit to the job runner.
 *
 * It is declared HERE, in `application`, and implemented in `@destaworks/jobs`, because the
 * dependency law runs one way: `jobs -> application`. A service that imported the queue would
 * close that into a cycle and let a handler enqueue itself through an edge the architecture check
 * could no longer see. So `application` states what it needs — "give this run id to a worker, tell
 * me the job id" — and the process that owns a queue registers something that can do it. Neither
 * `apps/web` nor `apps/api` has to know which one that is.
 *
 * The registration shape mirrors `setLoggerAdapter` in `@destaworks/config`: one process-wide
 * adapter, set once during composition. Unset is a deployment fault, not a user error, so it
 * fails loudly rather than degrading into a synchronous commit that would blow the request budget.
 */
export type MigrationCommitEnqueuer = (runId: string, tenantId: string) => Promise<string>;

let enqueuer: MigrationCommitEnqueuer | null = null;

/** Called by the composition root that owns a `JobQueue` (see `@destaworks/jobs`). */
export function registerMigrationCommitEnqueuer(next: MigrationCommitEnqueuer): void {
  enqueuer = next;
}

/** Test-only reset, so one suite's registration cannot leak into the next. */
export function clearMigrationCommitEnqueuer(): void {
  enqueuer = null;
}

export function requireMigrationCommitEnqueuer(): MigrationCommitEnqueuer {
  if (!enqueuer) {
    throw new AppError(
      "INTERNAL",
      "The import runner is not available. Try again shortly or contact support.",
    );
  }
  return enqueuer;
}
