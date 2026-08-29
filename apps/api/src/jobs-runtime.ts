import { setJobQueue } from "@destaworks/jobs/runtime";
import { registerEnqueuePorts } from "@destaworks/jobs/register";
import { createJobQueue } from "@destaworks/jobs/runtime/pg-boss-queue";

/** The queue, plus the one method shutdown needs — not the driver's type, which stays in `jobs`. */
export interface InstalledQueue {
  stop(): Promise<void>;
}

/**
 * Install the job runtime. Both processes call this and neither does it by hand, because doing it
 * by hand is how it goes wrong: the API and the worker have to agree on the driver AND on the
 * enqueue ports being pointed at it, and a process that installs one without the other looks
 * healthy right up until a route enqueues.
 *
 * That is not hypothetical — it was the state of this file's absence. `setJobQueue` was called and
 * `registerEnqueuePorts` was not, so the queue was live while `POST /migration/commit` and both
 * brief-generate routes answered INTERNAL. Every test passed, because each registers its own fake.
 */
export function installJobRuntime(): InstalledQueue {
  const queue = createJobQueue();
  setJobQueue(queue);
  registerEnqueuePorts(queue);
  return queue;
}
