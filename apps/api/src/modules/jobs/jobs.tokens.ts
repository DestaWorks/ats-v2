import type { JobQueue } from "@destaworks/jobs/queue";
import { serviceToken } from "../service-token";

/**
 * The queue, for a controller that needs to hand work to the worker instead of doing it in the
 * request. Declared apart from the module for the reason every token here is — see
 * `health.tokens.ts`: a token defined beside its module makes an ESM cycle with the controller
 * that injects it, and the app fails to boot with a `ReferenceError`.
 *
 * Typed as the PORT, not the pg-boss implementation. A controller that could see `PgBossJobQueue`
 * could call `start()` or `stop()`, and transport has no business deciding the queue's lifecycle.
 */
export const JOB_QUEUE = serviceToken<JobQueue>("JOB_QUEUE");
