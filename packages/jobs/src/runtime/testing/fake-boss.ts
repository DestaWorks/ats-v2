import type { JobResult, JobWithMetadata, Queue, QueueResult, SendOptions } from "pg-boss";
import type { BossClient } from "../boss";

/**
 * An in-memory pg-boss that models the three behaviours this package's correctness rests on:
 * a send routed through a caller-supplied executor, a retry budget, and a dead-letter queue.
 *
 * Not a mock that records calls — a small state machine, because what has to be proved is what the
 * queue *contains* after a sequence of events, not which methods were called. The one rule it
 * imitates exactly is the one the driver depends on: when `SendOptions.db` is present, the insert
 * is issued through it and is therefore subject to that transaction's outcome, and when it is
 * absent the insert is immediate. That is pg-boss's documented `ConnectionOptions` contract, and
 * it is the whole mechanism behind transactional enqueue.
 */
export interface StoredJob {
  id: string;
  queue: string;
  data: unknown;
  retryCount: number;
}

export class FakeBoss implements BossClient {
  /** Committed, visible rows — the only jobs a fetch can see. */
  readonly jobs: StoredJob[] = [];
  readonly queues = new Map<string, Omit<Queue, "name">>();
  readonly sends: { name: string; options: SendOptions }[] = [];
  started = false;
  stopped = false;

  readonly #handlers = new Map<
    string,
    (jobs: JobWithMetadata<unknown>[]) => Promise<JobResult[]>
  >();
  #nextId = 1;

  start(): Promise<unknown> {
    this.started = true;
    return Promise.resolve(this);
  }

  stop(): Promise<void> {
    this.stopped = true;
    return Promise.resolve();
  }

  createQueue(name: string, options?: Omit<Queue, "name">): Promise<void> {
    this.queues.set(name, options ?? {});
    return Promise.resolve();
  }

  async send(name: string, data: object, options: SendOptions): Promise<string | null> {
    const id = `job_${this.#nextId++}`;
    this.sends.push({ name, options });
    if (options.db) {
      // Exactly what pg-boss does with a supplied connection: the statement goes to the caller's
      // executor, and whether it is ever visible is that transaction's decision, not ours.
      await options.db.executeSql("insert into job (id, name, data) values ($1, $2, $3)", [
        id,
        name,
        JSON.stringify(data),
      ]);
      return id;
    }
    this.jobs.push({ id, queue: name, data, retryCount: 0 });
    return id;
  }

  work(
    name: string,
    _options: unknown,
    handler: (jobs: JobWithMetadata<unknown>[]) => Promise<JobResult[]>,
  ): Promise<string> {
    this.#handlers.set(name, handler);
    return Promise.resolve(`worker_${name}`);
  }

  getQueue(name: string): Promise<QueueResult | null> {
    if (!this.queues.has(name)) return Promise.resolve(null);
    const queued = this.jobs.filter((job) => job.queue === name).length;
    return Promise.resolve(queueResult(name, queued));
  }

  redrive(name: string, options?: { destination?: string; limit?: number }): Promise<number> {
    const source = this.jobs.filter((job) => job.queue === name);
    const moving = source.slice(0, options?.limit ?? source.length);
    for (const job of moving) {
      job.queue = options?.destination ?? job.queue;
      job.retryCount = 0;
    }
    return Promise.resolve(moving.length);
  }

  on(): unknown {
    return this;
  }

  /**
   * Run every ready job on one queue through its registered handler and settle the results the
   * way pg-boss would: a completed job leaves, a failed one is retried until its `retryLimit` is
   * spent and then dead-lettered, and a `deadletter` result is moved at once.
   *
   * Returns the number of jobs delivered, so a test can assert that a rolled-back enqueue caused
   * no delivery at all rather than inferring it from a handler that was not called.
   */
  async deliver(name: string): Promise<number> {
    const handler = this.#handlers.get(name);
    const ready = this.jobs.filter((job) => job.queue === name);
    if (!handler || ready.length === 0) return 0;

    const results = await handler(ready.map((job) => this.#asFetched(job)));
    for (const result of results) {
      const job = this.jobs.find((candidate) => candidate.id === result.id);
      if (!job) continue;
      if (result.status === "completed") this.#remove(job);
      else if (result.status === "deadletter") this.#deadLetter(job);
      else this.#failOrRetry(job, name);
    }
    return ready.length;
  }

  /** Jobs currently sitting in a queue's dead-letter queue. */
  deadLettered(name: string): StoredJob[] {
    return this.jobs.filter((job) => job.queue === this.#deadLetterName(name));
  }

  #failOrRetry(job: StoredJob, name: string): void {
    const retryLimit = this.queues.get(name)?.retryLimit ?? 0;
    if (job.retryCount >= retryLimit) this.#deadLetter(job);
    else job.retryCount += 1;
  }

  #deadLetter(job: StoredJob): void {
    job.queue = this.#deadLetterName(job.queue);
    job.retryCount = 0;
  }

  #deadLetterName(name: string): string {
    return this.queues.get(name)?.deadLetter ?? `${name}.dead`;
  }

  #remove(job: StoredJob): void {
    this.jobs.splice(this.jobs.indexOf(job), 1);
  }

  #asFetched(job: StoredJob): JobWithMetadata<unknown> {
    return {
      ...FETCHED_JOB_DEFAULTS,
      id: job.id,
      name: job.queue,
      data: job.data,
      retryCount: job.retryCount,
    };
  }
}

/**
 * A transaction that makes writes visible only on commit.
 *
 * Statements are buffered, not applied, so a rollback is genuinely indistinguishable from the
 * write never having happened — which is the property `enqueue({ tx })` has to have.
 */
export class FakeTransaction {
  readonly #buffered: unknown[][] = [];

  constructor(private readonly boss: FakeBoss) {}

  $queryRawUnsafe<T = unknown>(_query: string, ...values: unknown[]): Promise<T> {
    this.#buffered.push(values);
    return Promise.resolve([] as T);
  }

  commit(): void {
    for (const values of this.#buffered) {
      const [id, queue, data] = values;
      if (typeof id !== "string" || typeof queue !== "string" || typeof data !== "string") continue;
      this.boss.jobs.push({ id, queue, data: JSON.parse(data), retryCount: 0 });
    }
    this.#buffered.length = 0;
  }

  rollback(): void {
    this.#buffered.length = 0;
  }
}

function queueResult(name: string, queued: number): QueueResult {
  return {
    name,
    deferredCount: 0,
    queuedCount: queued,
    readyCount: queued,
    activeCount: 0,
    failedCount: 0,
    totalCount: queued,
    table: "job",
    createdOn: new Date(0),
    updatedOn: new Date(0),
    singletonsActive: null,
  };
}

/** The fields a fetched job carries that this fake has no opinion about. */
const FETCHED_JOB_DEFAULTS: JobWithMetadata<unknown> = {
  id: "",
  name: "",
  data: null,
  expireInSeconds: 60,
  heartbeatSeconds: null,
  signal: new AbortController().signal,
  priority: 0,
  state: "active",
  retryLimit: 0,
  retryCount: 0,
  retryDelay: 0,
  retryBackoff: false,
  startAfter: new Date(0),
  startedOn: new Date(0),
  singletonKey: null,
  singletonOn: null,
  deleteAfterSeconds: 0,
  createdOn: new Date(0),
  completedOn: null,
  keepUntil: new Date(0),
  policy: "standard",
  heartbeatOn: null,
  blocked: false,
  blocking: false,
  pendingDependencies: 0,
  deadLetter: "",
  output: {},
  sourceName: null,
  sourceId: null,
  sourceCreatedOn: null,
  sourceRetryCount: null,
};
