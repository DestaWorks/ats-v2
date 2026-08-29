import type { JobResult, JobWithMetadata } from "pg-boss";
import { logger } from "@destaworks/config/logger";
import { inspectJobs, type JobQueueHealth } from "../observability";
import { REGISTERED_JOBS } from "../registered-jobs";
import type { RegisteredJob } from "../registry";
import { runAttempt } from "./attempt";
import { createBossClient, type BossClient } from "./boss";
import { PgBossJobQueue } from "./pg-boss-queue";

/** Jobs one worker process runs at a time, per queue. */
const DEFAULT_CONCURRENCY = 2;

/** How long a graceful stop waits for in-flight jobs before the process gives up on them. */
const SHUTDOWN_GRACE_MS = 30_000;

export interface JobWorkerOptions {
  readonly boss: BossClient;
  readonly jobs: readonly RegisteredJob[];
  readonly concurrency?: number;
}

/**
 * The worker as the worker process builds it. Unlike the sender, the pg-boss instance is
 * constructed eagerly: a worker that cannot reach `DIRECT_URL` has nothing to do, and failing at
 * boot is what an orchestrator can act on.
 */
export function createJobWorker(jobs: readonly RegisteredJob[] = REGISTERED_JOBS): JobWorker {
  return new JobWorker({ boss: createBossClient({ role: "worker" }), jobs });
}

/**
 * The worker runtime: it subscribes to every registered job's queue and settles each attempt from
 * what `runAttempt` decides.
 *
 * It is a thin adapter on purpose. All of the behaviour worth testing — schema validation, the
 * deadline, whether a failure is worth retrying — lives in `runAttempt` and is exercised without a
 * database. What is here is the part only pg-boss can do: fetch, and report the outcome.
 */
export class JobWorker {
  readonly #boss: BossClient;
  readonly #jobs: readonly RegisteredJob[];
  readonly #concurrency: number;
  readonly #queue: PgBossJobQueue;

  constructor(options: JobWorkerOptions) {
    this.#boss = options.boss;
    this.#jobs = options.jobs;
    this.#concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.#queue = new PgBossJobQueue({ boss: () => this.#boss, jobs: options.jobs });
  }

  /**
   * Connect, provision the queues, and start consuming. Provisioning goes through the same
   * `PgBossJobQueue` the API enqueues with, so the queue a job is written to and the queue it is
   * read from can never be configured differently.
   */
  async start(): Promise<void> {
    await this.#queue.start();
    for (const job of this.#jobs) {
      await this.#boss.work(
        job.name,
        {
          // One job per fetch. `runAttempt` enforces a per-job deadline, and a batch shares the
          // worker's slot: a slow job in a batch of ten delays nine that were ready to run.
          batchSize: 1,
          localConcurrency: this.#concurrency,
          // Both are load-bearing, not conveniences. `includeMetadata` carries `retryCount`, which
          // is the only source of the attempt number the definition's budget is measured against.
          // `perJobResults` is what lets a permanent failure be dead-lettered immediately instead
          // of burning its remaining retries.
          includeMetadata: true,
          perJobResults: true,
        },
        (jobs) => this.#settle(job, jobs),
      );
      logger.info("jobs.worker_subscribed", {
        job: job.name,
        concurrency: this.#concurrency,
        maxAttempts: job.maxAttempts,
        timeoutMs: job.timeoutMs,
      });
    }
  }

  /**
   * Stop consuming and let in-flight jobs finish.
   *
   * A job that does not finish inside the grace window is not lost: it stays `active` with nothing
   * settling it, and the queue returns it to `created` once `expireInSeconds` passes, so the next
   * worker picks it up. That is also what happens when the process is killed outright — the
   * durability of an interrupted job comes from the expiry, not from this method running.
   */
  async stop(): Promise<void> {
    await this.#boss.stop({ graceful: true, close: true, timeout: SHUTDOWN_GRACE_MS });
  }

  /** The current state of every queue this worker serves. See `observability.ts`. */
  health(): Promise<JobQueueHealth[]> {
    return inspectJobs(this.#boss, this.#jobs);
  }

  async #settle(job: RegisteredJob, fetched: JobWithMetadata<unknown>[]): Promise<JobResult[]> {
    const results: JobResult[] = [];
    for (const fetchedJob of fetched) {
      const outcome = await runAttempt(job, {
        jobId: fetchedJob.id,
        rawPayload: fetchedJob.data,
        // `retryCount` is retries so far, so the first run reports attempt 1.
        attempt: fetchedJob.retryCount + 1,
        queueSignal: fetchedJob.signal,
        reportProgress: (done, total) => this.#reportProgress(job, fetchedJob.id, done, total),
      });
      results.push({
        id: fetchedJob.id,
        status: outcome.status,
        ...(outcome.output === undefined ? {} : { output: outcome.output }),
      });
    }
    return results;
  }

  /**
   * Progress is recorded as a log line rather than written back to the job row: the row is
   * rewritten on every settle, and a progress write racing the settle is how a completed job ends
   * up looking half-finished. A line per report is enough to tell "slow" from "stuck", which is
   * what the port says progress is for.
   */
  #reportProgress(job: RegisteredJob, jobId: string, done: number, total: number): Promise<void> {
    logger.info("job.progress", { job: job.name, jobId, done, total });
    return Promise.resolve();
  }
}
