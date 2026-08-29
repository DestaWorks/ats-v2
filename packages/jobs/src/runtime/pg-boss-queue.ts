import { fromPrisma, type SendOptions } from "pg-boss";
import { logger } from "@destaworks/config/logger";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { EnqueueOptions, JobDefinition, JobPayload, JobQueue } from "../queue";
import { REGISTERED_JOBS } from "../registered-jobs";
import type { RegisteredJob } from "../registry";
import { createBossClient, type BossClient } from "./boss";

/** The dead-letter queue for a job, by convention. One per job, not one shared: a redrive that
 *  cannot tell which queue a job came from cannot be run safely. */
export function deadLetterQueueName(jobName: string): string {
  return `${jobName}.dead`;
}

/**
 * What a caller may hand to `enqueue` as `tx`.
 *
 * The port types it `unknown` because the interface must not name a driver's transaction type.
 * This is the narrowing: anything that can run parameterised SQL on the caller's connection will
 * do, which is exactly what a Prisma interactive-transaction client is. Structural rather than
 * `Prisma.TransactionClient` so `packages/jobs` does not take a type dependency on the ORM for a
 * one-method shape.
 */
export interface TransactionalExecutor {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

function isTransactionalExecutor(value: unknown): value is TransactionalExecutor {
  return (
    typeof value === "object" &&
    value !== null &&
    "$queryRawUnsafe" in value &&
    typeof value.$queryRawUnsafe === "function"
  );
}

export interface PgBossJobQueueOptions {
  /**
   * Built on first use, not injected ready-made. Constructing a pg-boss instance reads
   * `DIRECT_URL`, and an API process that binds the queue but never enqueues — a controller test,
   * a deploy of a service that only reads — should not be required to have it.
   */
  readonly boss: () => BossClient;
  /** Every job that may be enqueued. Their queues (and dead-letter queues) are provisioned here. */
  readonly jobs: readonly RegisteredJob[];
}

/**
 * The pg-boss implementation of the `JobQueue` port.
 *
 * It owns two things: turning a `JobDefinition` into the queue's configuration, and routing an
 * enqueue either through the caller's transaction or through pg-boss's own pool.
 */
export class PgBossJobQueue implements JobQueue {
  readonly #createBoss: () => BossClient;
  readonly #jobs: readonly RegisteredJob[];
  #boss: BossClient | undefined;
  #started: Promise<void> | undefined;

  constructor(options: PgBossJobQueueOptions) {
    this.#createBoss = options.boss;
    this.#jobs = options.jobs;
  }

  /**
   * Connect and provision the queues. Idempotent and safe to race: pg-boss's `create_queue` is an
   * `ON CONFLICT DO NOTHING` insert under an advisory lock, so a worker and several API instances
   * starting at once converge on one definition rather than fighting over it.
   *
   * Called lazily by `enqueue`, so an API process that never enqueues never opens a queue
   * connection, and a boot in an environment without `DIRECT_URL` fails at the first enqueue with
   * a clear error rather than refusing to start at all.
   */
  start(): Promise<void> {
    this.#started ??= this.#connect().catch((error: unknown) => {
      // Clear the memo so the next enqueue retries rather than resolving a rejected promise
      // forever — a queue that stays broken because the database was briefly unreachable at boot
      // is a worse failure than the original one.
      this.#started = undefined;
      throw error;
    });
    return this.#started;
  }

  async stop(): Promise<void> {
    const boss = this.#boss;
    this.#started = undefined;
    this.#boss = undefined;
    if (boss) await boss.stop({ graceful: true, close: true });
  }

  async enqueue<TDefinition extends JobDefinition<unknown>>(
    definition: TDefinition,
    payload: JobPayload<TDefinition>,
    options?: EnqueueOptions & { tx?: unknown },
  ): Promise<string> {
    await this.start();
    const boss = this.#boss;
    if (!boss) throw new AppError("INTERNAL", "The job queue is not connected.");

    const sendOptions: SendOptions = {
      ...queueOptionsFor(definition),
      ...(options?.startAfterMs === undefined ? {} : { startAfter: options.startAfterMs / 1000 }),
      ...(options?.singletonKey === undefined ? {} : { singletonKey: options.singletonKey }),
      ...(options?.tx === undefined ? {} : { db: fromPrisma(asExecutor(options.tx)) }),
    };

    const id = await boss.send(definition.name, asJsonObject(payload), sendOptions);
    if (id === null) {
      // pg-boss returns null when a singleton policy collapsed the send into an existing job.
      // That is the documented behaviour of `singletonKey`, not an error, but the caller was
      // promised an id — so it gets the key that identifies the job that is already pending.
      if (options?.singletonKey !== undefined) return options.singletonKey;
      throw new AppError("CONFLICT", `Queue "${definition.name}" refused the job.`);
    }
    return id;
  }

  async #connect(): Promise<void> {
    const boss = this.#createBoss();
    boss.on("error", (payload) => logger.error("jobs.boss_error", { detail: describe(payload) }));
    boss.on("warning", (payload) =>
      logger.warn("jobs.boss_warning", { detail: describe(payload) }),
    );
    await boss.start();
    for (const job of this.#jobs) {
      await boss.createQueue(deadLetterQueueName(job.name), { policy: "standard" });
      await boss.createQueue(job.name, {
        ...queueOptionsFor(job),
        policy: "standard",
        deadLetter: deadLetterQueueName(job.name),
        // Only acted on when the instance holds a NOTIFY listener (the worker). Set on the queue
        // regardless so a job enqueued by the API still wakes a worker immediately.
        notify: true,
      });
    }
    this.#boss = boss;
    logger.info("jobs.queues_ready", { queues: this.#jobs.length });
  }
}

/**
 * The queue an API process enqueues through: a sender, so it neither migrates the schema nor holds
 * a NOTIFY listener. Nothing connects until the first `enqueue`.
 */
export function createJobQueue(jobs: readonly RegisteredJob[] = REGISTERED_JOBS): PgBossJobQueue {
  return new PgBossJobQueue({ boss: () => createBossClient({ role: "sender" }), jobs });
}

/**
 * The definition's guarantees, expressed as pg-boss queue settings. One function, used both when
 * the queue is created and on every send, so a definition edited after the queue already exists
 * still governs the jobs written to it.
 */
export function queueOptionsFor(
  definition: Pick<JobDefinition<unknown>, "maxAttempts" | "timeoutMs">,
): SendOptions {
  return {
    // `retryLimit` counts retries, `maxAttempts` counts attempts. Off by one, and getting it wrong
    // gives every job one more or one fewer run than its definition promises.
    retryLimit: Math.max(0, definition.maxAttempts - 1),
    retryBackoff: true,
    retryDelay: 1,
    retryDelayMax: 300,
    // The queue's own ceiling on an attempt, as a backstop to the runner's `AbortSignal`: if the
    // worker process is killed mid-job, nothing is left to abort anything, and this is what
    // returns the job to the queue instead of leaving it active forever. Rounded up, and given a
    // second of slack, so it can never fire before the deadline the handler was promised.
    expireInSeconds: Math.max(1, Math.ceil(definition.timeoutMs / 1000) + 1),
  };
}

/** Narrow the port's `unknown` tx to something that can actually run the insert. */
function asExecutor(tx: unknown): TransactionalExecutor {
  if (!isTransactionalExecutor(tx)) {
    throw new AppError(
      "INTERNAL",
      "enqueue({ tx }) needs the transaction client from prisma.$transaction.",
    );
  }
  return tx;
}

/**
 * pg-boss stores the payload in a JSON column and asks for an `object`. The port's payload type is
 * whatever a Zod schema describes, which could be a primitive — so the restriction is stated here
 * rather than smuggled past with a wrapper the dequeue side would have to know to unwrap. A job
 * payload is a named record; that also leaves room to add a field to one without breaking the jobs
 * already sitting in the queue.
 */
function asJsonObject(payload: unknown): object {
  if (typeof payload === "object" && payload !== null) return payload;
  throw new AppError("BAD_REQUEST", "A job payload must be an object.");
}

/** pg-boss's `error`/`warning` events carry an unknown shape. Reduce it to something loggable
 *  that cannot be a PII-bearing object graph. */
function describe(payload: unknown): string {
  if (payload instanceof Error) return payload.name;
  if (typeof payload === "string") return payload;
  return typeof payload;
}
