import { registerMigrationCommitEnqueuer } from "@destaworks/application/migration-commit.port";
import { registerBriefGenerationEnqueuer } from "@destaworks/application/brief-generation.port";
import { enqueueDailyBriefGeneration, enqueueWeeklyBriefGeneration } from "./enqueue/briefs";
import { migrationCommitJob } from "./queues/migration-commit.job";
import type { JobQueue } from "./queue";

/**
 * The composition seam between a queue driver and the work that runs on it.
 *
 * A process that owns a `JobQueue` calls `registerEnqueuePorts(queue)` once at startup, pointing
 * the ports that `@destaworks/application` declares at that queue.
 *
 * Mounting handlers is deliberately NOT done here: `REGISTERED_JOBS` is the one list the worker and
 * the driver both walk, and a second list returned from this function was exactly the duplication
 * that let the two disagree about which jobs exist.
 *
 * The driver itself is not this package's concern — it is chosen behind `JobQueue` (see `queue.ts`)
 * and nothing here names it.
 */

export function registerEnqueuePorts(queue: JobQueue): void {
  registerMigrationCommitEnqueuer((runId) =>
    queue.enqueue(
      migrationCommitJob,
      { runId },
      // One in-flight job per run. A retried POST, or a double-click on "commit", stages a new run
      // and gets its own job; what this stops is the same run being handed to two workers at once.
      { singletonKey: `${migrationCommitJob.name}:${runId}` },
    ),
  );

  registerBriefGenerationEnqueuer({
    daily: enqueueDailyBriefGeneration,
    weekly: enqueueWeeklyBriefGeneration,
  });
}
