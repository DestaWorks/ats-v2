import { logger } from "@destaworks/config/logger";
import { requireServerEnv } from "@destaworks/config/env";
import { installNodeLogger } from "@destaworks/config/logger/install";
import { shutdownApplication } from "@destaworks/application/lifecycle";
import { logJobHealth } from "@destaworks/jobs/observability";
import { REGISTERED_JOBS } from "@destaworks/jobs/registered-jobs";
import { createJobWorker, type JobWorker } from "@destaworks/jobs/runtime/worker";

/**
 * The job worker's entry point — a **separate process from the API**, deployed from the same
 * image and sharing its code, but not its lifecycle.
 *
 * Separate because the two scale on different things and fail differently. The API is sized by
 * request concurrency and must answer in milliseconds; the worker is sized by queue depth and runs
 * jobs measured in minutes. Sharing a process means a burst of ETL work starves request handling,
 * and a rolling API deploy kills jobs mid-flight for no reason. It also keeps the connection
 * budget legible: this process's queue pool is `JOBS_WORKER_POOL_MAX`, the API's is
 * `JOBS_SENDER_POOL_MAX`, and neither is hiding inside the other.
 *
 * It is not a NestJS app. There are no requests to route, no guards to run and no controllers to
 * register; a container would only add a boot path with nothing in it. What it does share with
 * `main.ts` is everything that makes the process observable and stoppable — the same logger
 * install, the same signal handling — because those are properties of a process, not of a server.
 */
async function bootstrap(): Promise<void> {
  // Same reason as `main.ts`, and it matters more here: a worker with a bad DIRECT_URL has no
  // request to fail, so without this it starts, consumes nothing, and looks healthy.
  requireServerEnv();
  installNodeLogger();

  if (REGISTERED_JOBS.length === 0) {
    // Not an error: the runtime lands before the handlers do, and a worker that refused to start
    // would fail a deploy over an empty list. It is logged loudly because a worker that silently
    // consumes nothing is the failure this line exists to make impossible to miss.
    logger.warn("worker.no_jobs_registered");
  }

  const worker = createJobWorker();
  await worker.start();
  logger.info("worker.listening", { jobs: REGISTERED_JOBS.length });

  startHeartbeat(worker);
  installShutdownHandlers(worker);
}

/** How often the worker reports queue depth and dead-letter counts. */
const HEARTBEAT_MS = 60_000;

/**
 * Report every queue's health on a timer.
 *
 * Without this, "a failed job is visible" depends on someone querying the database at the right
 * moment. A line per queue per minute turns dead-lettered jobs into something a log-based alert
 * can watch, and it is the only way a queue that is quiet *because nothing is being enqueued* can
 * be told apart from one that is quiet because the worker is wedged.
 */
function startHeartbeat(worker: JobWorker): void {
  const timer = setInterval(() => {
    void worker
      .health()
      .then(logJobHealth)
      .catch(() => logger.warn("worker.health_unavailable"));
  }, HEARTBEAT_MS);
  // The heartbeat must never be the reason the process stays alive; the workers are.
  timer.unref();
}

/**
 * Stop cleanly on the signals an orchestrator sends.
 *
 * `worker.stop()` stops fetching and waits for in-flight jobs, so a deploy does not abandon work
 * halfway. A job that outlasts the grace window is still not lost: it stays `active` with nothing
 * settling it, and the queue returns it to the ready state once its `expireInSeconds` passes — the
 * same mechanism that recovers everything in flight when the process is killed outright and this
 * handler never runs at all. Losing a job would require the queue to forget it, and the queue is
 * Postgres.
 *
 * Guarded against a second signal for the same reason `main.ts` is: an impatient orchestrator
 * sends SIGTERM twice, and re-entering this closes the pool underneath jobs that are still
 * draining.
 */
function installShutdownHandlers(worker: JobWorker): void {
  let stopping = false;

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      if (stopping) return;
      stopping = true;
      logger.info("worker.shutting_down", { signal });

      void worker
        .stop()
        .then(() => shutdownApplication())
        .then(() => {
          logger.info("worker.stopped", { signal });
          process.exit(0);
        });
    });
  }
}

// No try/catch, for the reason `main.ts` gives: if the worker cannot start it cannot work, and
// Node's own unhandled-rejection exit tells an orchestrator more than this file could log.
await bootstrap();
