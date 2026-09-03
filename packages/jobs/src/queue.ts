import type { ZodType } from "zod";

/**
 * The queue port (SAAS-RESTRUCTURE-PLAN Phase 5). Everything that enqueues or handles work depends
 * on this interface, never on the backing driver, so the driver is a decision this codebase can
 * revisit without touching a single caller.
 *
 * That mattered immediately: the obvious alternative was BullMQ on Redis. The app now runs Redis
 * for rate limiting, so the earlier objection — that the only Redis here spoke REST and could not
 * hold the blocking connection BullMQ needs — no longer applies. The decision stands on the
 * remaining reason, which was always the stronger one: an enqueue that travels inside the caller's
 * transaction cannot be lost when that transaction rolls back, and only a queue in the same
 * database can offer that. Redis here is a counter, deliberately not persisted.
 *
 * The trade-off is written down rather than assumed: a Postgres queue adds load and connections to
 * the same database serving requests, and at high throughput a dedicated broker is faster. At this
 * app's volume — briefs, exports, one ETL — that ceiling is far away, and the transactional
 * enqueue below is worth more than the throughput.
 */

/** A job's payload type, derived from the schema that validates it at the boundary. */
export type JobPayload<TDefinition> =
  TDefinition extends JobDefinition<infer TPayload> ? TPayload : never;

export interface JobDefinition<TPayload> {
  /** Stable queue name. Changing it orphans in-flight jobs, so treat it as a wire contract. */
  readonly name: string;
  /**
   * Validates the payload when the job is dequeued, not only when it is enqueued. A job can sit in
   * the queue across a deploy, so the code that runs it is not necessarily the code that wrote it.
   */
  readonly schema: ZodType<TPayload>;
  /**
   * How many times this job may run before it is dead-lettered. Bounded per job rather than
   * globally: a brief regenerating is cheap to retry, an ETL commit is not.
   */
  readonly maxAttempts: number;
  /**
   * Wall-clock ceiling for one attempt. A handler that exceeds it is aborted through the signal it
   * is handed, so a hung provider call cannot occupy a worker slot indefinitely.
   */
  readonly timeoutMs: number;
}

/** What a handler is given: its validated payload, and the means to stop when time runs out. */
export interface JobContext<TPayload> {
  readonly payload: TPayload;
  readonly attempt: number;
  /** Aborted when `timeoutMs` elapses. Pass it to every call that accepts one. */
  readonly signal: AbortSignal;
  /** Records progress for a long job so a human can tell "slow" from "stuck". */
  readonly reportProgress: (done: number, total: number) => Promise<void>;
}

export type JobHandler<TPayload> = (ctx: JobContext<TPayload>) => Promise<void>;

export interface EnqueueOptions {
  /** Delay before the job becomes visible to a worker. */
  readonly startAfterMs?: number;
  /**
   * Collapses duplicates: enqueuing the same key while one is pending is a no-op. This is how a
   * user clicking "generate" twice does not pay for two AI runs.
   */
  readonly singletonKey?: string;
}

export interface JobQueue {
  /**
   * Enqueue work. When `tx` is supplied the job is written in that transaction, so it becomes
   * visible if and only if the mutation that caused it commits — the same reasoning that keeps
   * `writeAudit` inside its caller's transaction. A queue that cannot do this either loses jobs on
   * rollback or runs them for mutations that never happened.
   */
  enqueue<TDefinition extends JobDefinition<unknown>>(
    definition: TDefinition,
    payload: JobPayload<TDefinition>,
    options?: EnqueueOptions & { tx?: unknown },
  ): Promise<string>;
}
