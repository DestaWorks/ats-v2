import { AppError, type AppErrorCode } from "@destaworks/integrations/http/app-error";

/**
 * Failures a retry cannot fix.
 *
 * Every job gets `maxAttempts` tries, but spending them all on an error whose answer will not
 * change is waste with a cost: the queue holds the row for the whole backoff window, and the real
 * signal — "this job is broken, look at it" — arrives minutes later than it needed to. So the
 * decision is made from the error, not the attempt count.
 *
 * The line is *the world said no* versus *the world was busy*. A payload that fails its schema, a
 * candidate that no longer exists, a stage gate that refuses the transition: none of those become
 * true on the third attempt. `RATE_LIMITED`, `UPSTREAM_ERROR` and `INTERNAL` are the opposite —
 * they are exactly what retries exist for — and anything that is not an `AppError` at all is
 * treated as transient, because an unrecognised failure is not evidence of a permanent one.
 *
 * `FEATURE_DISABLED` is deliberately absent: it means a key is missing from the environment, which
 * a deploy can fix while the job is still in its retry window.
 */
const PERMANENT_CODES: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  "BAD_REQUEST",
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "STAGE_BLOCKED",
]);

export function isPermanentFailure(error: unknown): boolean {
  return error instanceof AppError && PERMANENT_CODES.has(error.code);
}

/** The code to report for a failure, for logs and for the stored job output. */
export function failureCode(error: unknown): AppErrorCode {
  return error instanceof AppError ? error.code : "INTERNAL";
}

/**
 * What gets written to the job row as its failure output, and it is deliberately not the error.
 *
 * pg-boss serialises whatever it is handed, and an arbitrary `Error` message is unsafe to persist
 * here: Prisma embeds field values in its messages, and an upstream client will happily quote the
 * request body it failed on. Both of those are candidate PII. An `AppError` message is the one
 * kind this codebase already guarantees is safe to show a person (Engineering standards, "API
 * contracts"), so it is the only kind carried through.
 */
export function failureOutput(error: unknown, attempt: number): Record<string, unknown> {
  return {
    code: failureCode(error),
    attempt,
    permanent: isPermanentFailure(error),
    ...(error instanceof AppError ? { message: error.message } : {}),
  };
}
