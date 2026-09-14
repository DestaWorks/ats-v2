import { logger } from "@destaworks/config/logger";
import type { RegisteredJob } from "./registry";
import type { BossClient } from "./runtime/boss";
import { deadLetterQueueName } from "./runtime/pg-boss-queue";

/**
 * What an operator needs to answer "is the queue healthy, and is anything stuck?" for one job.
 *
 * `failed` and `deadLettered` are the two that matter and they are not the same thing: `failed`
 * counts attempts that failed and are still within their retry budget (working as designed, unless
 * it climbs), while `deadLettered` counts jobs that gave up and will never run again unless a
 * person retries them.
 */
export interface JobQueueHealth {
  readonly job: string;
  readonly queued: number;
  readonly active: number;
  readonly failed: number;
  readonly deadLettered: number;
}

/**
 * Read the current state of every registered job's queue.
 *
 * This is the "a failed job is visible" half of the phase's done-when. It reads counts rather than
 * rows on purpose: a job's row contains the payload, and a payload carries candidate PII, so the
 * operational view is deliberately one that cannot leak it. The detail of a specific failure lives
 * on the row, inside the database, reachable by someone who is already trusted with the data.
 */
export async function inspectJobs(
  boss: BossClient,
  jobs: readonly RegisteredJob[],
): Promise<JobQueueHealth[]> {
  const health: JobQueueHealth[] = [];
  for (const job of jobs) {
    const queue = await boss.getQueue(job.name);
    const dead = await boss.getQueue(deadLetterQueueName(job.name));
    health.push({
      job: job.name,
      queued: queue?.queuedCount ?? 0,
      active: queue?.activeCount ?? 0,
      failed: queue?.failedCount ?? 0,
      deadLettered: dead?.queuedCount ?? 0,
    });
  }
  return health;
}

/**
 * Move dead-lettered jobs back onto the queue they failed on, oldest first.
 *
 * This is the "a dead-lettered one is retryable" half. It is a deliberate operator action and not
 * an automatic one: a job reaches the dead-letter queue only after its whole retry budget is spent
 * or because it failed permanently, so replaying it without someone having fixed the cause just
 * spends the budget again. `limit` bounds the blast radius when the cause was an outage and the
 * dead-letter queue holds thousands.
 */
export async function retryDeadLettered(
  boss: BossClient,
  job: RegisteredJob,
  limit: number,
): Promise<number> {
  const moved = await boss.redrive(deadLetterQueueName(job.name), {
    destination: job.name,
    limit,
  });
  logger.info("jobs.dead_letter_redriven", { job: job.name, moved, limit });
  return moved;
}

/** Emit the health of every queue as one structured line per job. What the worker logs on a
 *  heartbeat, and what an alert on a rising `deadLettered` is built from. */
export function logJobHealth(health: readonly JobQueueHealth[]): void {
  for (const entry of health) logger.info("jobs.queue_health", { ...entry });
}
