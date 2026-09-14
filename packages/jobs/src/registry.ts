import { AppError } from "@destaworks/integrations/http/app-error";
import type { JobContext, JobDefinition, JobHandler } from "./queue";

/**
 * Everything a handler is given except the payload — the part the worker builds and the part that
 * does not depend on the job's type. Derived from the port rather than restated, so a field added
 * to `JobContext` reaches the worker without a second declaration to keep in step.
 */
export type JobAttemptContext = Omit<JobContext<unknown>, "payload">;

/**
 * A definition paired with its handler, with the payload type erased.
 *
 * The worker holds one list of every job it can run, and those jobs have different payload types.
 * `RegisteredJob<TPayload>` could not go in that list: `JobHandler` takes its payload as a
 * parameter, so under `strictFunctionTypes` a handler for one payload is not a handler for
 * `unknown`, and the list would need a cast per entry. Capturing the type parameter inside
 * `defineJob`'s closure instead gives the list a single element type with no cast at all — and it
 * puts the schema check on the only path that reaches the handler, so an unvalidated payload is
 * not something a caller can choose to skip.
 */
export interface RegisteredJob {
  readonly name: string;
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  /**
   * Validate `rawPayload` against the definition's schema, then run the handler. Throws
   * `AppError("BAD_REQUEST")` when the payload does not match — a permanent failure, because a
   * payload that fails its schema will fail it again on every retry.
   */
  run(rawPayload: unknown, context: JobAttemptContext): Promise<void>;
}

/**
 * Pair a definition with the code that runs it. This is the one way a job enters the worker's
 * vocabulary: `REGISTERED_JOBS` holds the results, and the worker starts a pg-boss worker per
 * entry. A definition with no `defineJob` call is enqueueable but will never be picked up, which
 * is why the two are declared together rather than in separate lists to keep aligned by hand.
 */
export function defineJob<TPayload>(
  definition: JobDefinition<TPayload>,
  handler: JobHandler<TPayload>,
): RegisteredJob {
  return {
    name: definition.name,
    maxAttempts: definition.maxAttempts,
    timeoutMs: definition.timeoutMs,
    async run(rawPayload, context) {
      const parsed = definition.schema.safeParse(rawPayload);
      if (!parsed.success) {
        // The issues are deliberately not attached: a payload carries candidate PII, and a Zod
        // issue quotes the value it rejected. The queue name and job id are enough to find the
        // row, and the row is inside the same trust boundary as the data.
        throw new AppError(
          "BAD_REQUEST",
          `Payload rejected by the schema for queue "${definition.name}".`,
        );
      }
      await handler({ ...context, payload: parsed.data });
    },
  };
}
