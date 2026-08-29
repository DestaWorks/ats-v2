import { logger } from "@destaworks/config/logger";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { RegisteredJob } from "../registry";
import { failureCode, failureOutput, isPermanentFailure } from "./failure";

/** How the queue must settle one attempt. Mirrors pg-boss's per-job settlement vocabulary. */
export type AttemptStatus = "completed" | "failed" | "deadletter";

export interface AttemptOutcome {
  readonly status: AttemptStatus;
  /** Written to the job row. PII-free by construction — see `failureOutput`. */
  readonly output: Record<string, unknown> | undefined;
}

export interface AttemptInput {
  readonly jobId: string;
  readonly rawPayload: unknown;
  /** 1 for the first try. Used for the retry budget and for the log line. */
  readonly attempt: number;
  /**
   * The queue's own abort for this attempt (pg-boss aborts at `expireInSeconds`). Composed with
   * our deadline rather than replaced by it: the queue's is coarse and second-granular, ours is
   * the contract the definition declares, and either firing must stop the handler.
   */
  readonly queueSignal?: AbortSignal;
  readonly reportProgress: (done: number, total: number) => Promise<void>;
}

/**
 * Run one attempt of one job under its declared deadline, and classify the result.
 *
 * This is the whole of the runner's behaviour and it is deliberately free of pg-boss: it takes a
 * payload and returns how the attempt should be settled, so the timeout, the retry classification
 * and the dead-letter decision are testable without a database. The worker is then a thin adapter
 * that fetches, calls this, and reports what it says.
 *
 * The deadline is enforced twice on purpose. The handler is handed an `AbortSignal` so a
 * well-behaved caller (fetch, the AI SDK, Prisma) unwinds at the deadline, *and* the attempt is
 * raced against that signal so a handler that ignores it still frees the worker slot. Only the
 * first is cooperative; only the second is a guarantee.
 */
export async function runAttempt(job: RegisteredJob, input: AttemptInput): Promise<AttemptOutcome> {
  const log = logger.child({ job: job.name, jobId: input.jobId, attempt: input.attempt });
  const startedAt = Date.now();

  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort(
      new AppError("INTERNAL", `Job exceeded its ${job.timeoutMs}ms deadline and was aborted.`),
    );
  }, job.timeoutMs);
  // `unref` so a pending deadline cannot by itself hold the worker process open at shutdown.
  timer.unref?.();

  const signal = input.queueSignal
    ? AbortSignal.any([input.queueSignal, deadline.signal])
    : deadline.signal;
  const aborted = abortRejection(signal);

  log.debug("job.attempt_started");
  try {
    await Promise.race([
      job.run(input.rawPayload, {
        attempt: input.attempt,
        signal,
        reportProgress: input.reportProgress,
      }),
      aborted.promise,
    ]);
    log.info("job.completed", { durationMs: Date.now() - startedAt });
    return { status: "completed", output: undefined };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const permanent = isPermanentFailure(error);
    const lastAttempt = input.attempt >= job.maxAttempts;
    const output = failureOutput(error, input.attempt);
    const fields = { durationMs, code: failureCode(error), maxAttempts: job.maxAttempts };

    if (permanent) {
      // Straight to the dead-letter queue, skipping the remaining budget: see `failure.ts`.
      log.error("job.dead_lettered", { ...fields, reason: "permanent" });
      return { status: "deadletter", output };
    }
    // A transient failure on the last attempt is dead-lettered by the queue itself, so it is
    // reported as `failed` and logged at `error` — the retry budget is spent either way, and
    // letting the queue do it keeps one place deciding when the budget is exhausted.
    if (lastAttempt) log.error("job.dead_lettered", { ...fields, reason: "attempts_exhausted" });
    else log.warn("job.attempt_failed", fields);
    return { status: "failed", output };
  } finally {
    clearTimeout(timer);
    aborted.dispose();
  }
}

/**
 * A promise that rejects when `signal` aborts, plus the means to stop listening.
 *
 * `dispose` is what makes this safe to race: once the handler has won, the listener is removed, so
 * a later abort (the queue expiring the job after we already reported success) cannot reject a
 * promise nobody is awaiting and crash the worker on an unhandled rejection.
 */
function abortRejection(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let dispose = (): void => {};
  const promise = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void => {
      const { reason } = signal;
      reject(
        reason instanceof Error
          ? reason
          : new AppError("INTERNAL", "Job was aborted before it finished."),
      );
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    dispose = () => signal.removeEventListener("abort", onAbort);
  });
  return { promise, dispose };
}
