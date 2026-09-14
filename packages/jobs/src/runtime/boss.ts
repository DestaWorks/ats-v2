import { PgBoss } from "pg-boss";
import type {
  JobResult,
  JobWithMetadata,
  Queue,
  QueueResult,
  RedriveOptions,
  SendOptions,
  StopOptions,
  WorkOptions,
} from "pg-boss";
import { AppError } from "@destaworks/integrations/http/app-error";

/**
 * The slice of pg-boss this package uses.
 *
 * Narrow on purpose: it is the seam a test doubles, and it is the list of pg-boss features the
 * codebase would have to reimplement to change driver. The member types are pg-boss's own rather
 * than restated, so the double is checked against the real library and cannot drift from it.
 */
export interface BossClient {
  start(): Promise<unknown>;
  stop(options?: StopOptions): Promise<void>;
  createQueue(name: string, options?: Omit<Queue, "name">): Promise<void>;
  send(name: string, data: object, options: SendOptions): Promise<string | null>;
  work(
    name: string,
    options: WorkOptions & { perJobResults: true; includeMetadata: true },
    handler: (jobs: JobWithMetadata<unknown>[]) => Promise<JobResult[]>,
  ): Promise<string>;
  getQueue(name: string): Promise<QueueResult | null>;
  redrive(name: string, options?: RedriveOptions): Promise<number>;
  on(event: "error" | "warning", listener: (payload: unknown) => void): unknown;
}

/**
 * What a pg-boss instance is for. The two roles differ in more than concurrency, so they are named
 * rather than configured field by field at each call site.
 *
 * - `worker` owns the schema (it migrates), runs maintenance, and listens for NOTIFY.
 * - `sender` only inserts. It never migrates, never supervises, and never holds a listener
 *   connection, because an API process that enqueues has no business owning the queue's schema or
 *   competing for its maintenance lock.
 */
export type BossRole = "worker" | "sender";

/**
 * Connection budget, and the reason it is not left to a default.
 *
 * pg-boss opens its own pool, entirely separate from Prisma's. Prisma's is already sized by
 * `DB_POOL_MAX` (default 5) against Supabase's pooler; a second pool that defaults to pg-boss's
 * own `max` would silently add an unbounded-looking amount of database concurrency to a database
 * that is already near its ceiling, and the failure mode is the whole app, not the queue.
 *
 * `worker` gets 4: one connection is pinned to LISTEN/NOTIFY, leaving three for fetch, settle and
 * the maintenance/monitor loops — enough that a maintenance pass does not stall a fetch, and small
 * enough that ten worker instances still fit.
 *
 * `sender` gets 2. An enqueue that travels with a caller's transaction costs pg-boss nothing (it
 * runs on the Prisma connection the transaction already holds), so this pool only serves the
 * unattached `enqueue()` calls and the one-off queue provisioning at start. Two is a working
 * connection plus headroom for a concurrent request; more would be a pool sized for traffic that
 * is not there.
 */
const POOL_MAX: Record<BossRole, number> = { worker: 4, sender: 2 };

/** Env var overriding `POOL_MAX` per role, so a hosting decision does not need a code change. */
const POOL_MAX_ENV: Record<BossRole, string> = {
  worker: "JOBS_WORKER_POOL_MAX",
  sender: "JOBS_SENDER_POOL_MAX",
};

/** The environment as these functions read it. Not `NodeJS.ProcessEnv`, which demands
 *  `NODE_ENV` and so cannot be satisfied by a test passing the two variables under test. */
export type JobsEnv = Record<string, string | undefined>;

export interface BossClientOptions {
  readonly role: BossRole;
  /** Overrides the env lookup. For tests, and for a host that resolves its URL another way. */
  readonly connectionString?: string;
}

/**
 * The queue's connection string, and it is **`DIRECT_URL`, never `DATABASE_URL`**.
 *
 * `DATABASE_URL` points at Supabase's transaction pooler, which multiplexes many clients onto few
 * server connections and hands a different one back per transaction. pg-boss needs the opposite:
 * `LISTEN/NOTIFY` and its advisory maintenance locks are *session* state, and a session the pooler
 * is free to reassign holds neither. The failure is silent — the queue accepts jobs, the worker
 * reports itself started, and nothing is ever woken — which is why this reads one variable and
 * refuses rather than falling back to the one that is always set.
 */
export function jobsConnectionString(env: JobsEnv = process.env): string {
  const direct = env["DIRECT_URL"];
  if (!direct) {
    throw new AppError(
      "INTERNAL",
      "DIRECT_URL is required for the job queue. DATABASE_URL is the transaction pooler, " +
        "which cannot hold the LISTEN/NOTIFY session the queue depends on.",
    );
  }
  return direct;
}

export function jobsPoolMax(role: BossRole, env: JobsEnv = process.env): number {
  const parsed = Number.parseInt(env[POOL_MAX_ENV[role]] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : POOL_MAX[role];
}

/**
 * Build a pg-boss instance for one role. Nothing connects until `start()` is called.
 *
 * `application_name` is set so a connection from the queue is distinguishable from a request's in
 * `pg_stat_activity` — the first question asked when the database is out of connections is which
 * process is holding them.
 */
export function createBossClient(options: BossClientOptions): BossClient {
  const worker = options.role === "worker";
  return new PgBoss({
    connectionString: options.connectionString ?? jobsConnectionString(),
    max: jobsPoolMax(options.role),
    application_name: `destaworks-jobs-${options.role}`,
    // Only the worker owns the queue's schema. A sender that migrated would run DDL from a web
    // request, and two roles racing the same migration is a deadlock waiting for a deploy.
    migrate: worker,
    createSchema: worker,
    supervise: worker,
    schedule: worker,
    // Wakes a worker the moment a job lands instead of at its next poll. Only meaningful in the
    // worker, and only possible at all because the connection above is the direct one.
    useListenNotify: worker,
  });
}
