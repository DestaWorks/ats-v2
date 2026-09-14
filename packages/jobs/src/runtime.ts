import { AppError } from "@destaworks/integrations/http/app-error";
import type { EnqueueOptions, JobDefinition, JobPayload, JobQueue } from "./queue";

/**
 * Where the queue DRIVER is plugged in — and the only place that knows a driver exists.
 *
 * Same shape as `setLoggerAdapter` in `@destaworks/config/logger`: callers hold a stable object
 * and the composition root swaps what backs it at boot. Without this, every enqueuing controller
 * would have to import the driver to construct it, and "the driver is a decision we can revisit"
 * — the whole point of the port — would be false.
 *
 * Until a driver is installed, `jobQueue` is a queue that refuses. `FEATURE_DISABLED` (503) is
 * the same answer the app already gives for unconfigured object storage and AI: an environment
 * missing its background-job infrastructure says so plainly instead of accepting work it will
 * never run.
 */

const unconfiguredQueue: JobQueue = {
  enqueue(): Promise<string> {
    return Promise.reject(new AppError("FEATURE_DISABLED", "Background jobs are not configured"));
  },
};

let installed: JobQueue = unconfiguredQueue;

/** Install the real driver. Called once, from the process's composition root. */
export function setJobQueue(queue: JobQueue): void {
  installed = queue;
}

/** Back to refusing. For tests, and for a shutdown that must not accept new work. */
export function resetJobQueue(): void {
  installed = unconfiguredQueue;
}

/**
 * The application-wide queue handle. Resolves the installed driver at CALL time, not at import
 * time, so a module that captures it during bootstrap still enqueues through the driver that is
 * installed later in the same boot.
 */
export const jobQueue: JobQueue = {
  enqueue<TDefinition extends JobDefinition<unknown>>(
    definition: TDefinition,
    payload: JobPayload<TDefinition>,
    options?: EnqueueOptions & { tx?: unknown },
  ): Promise<string> {
    return installed.enqueue(definition, payload, options);
  },
};
