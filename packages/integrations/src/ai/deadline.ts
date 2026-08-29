/**
 * The wall-clock budget for a whole AI operation (SAAS-RESTRUCTURE-PLAN Phase 5, "Give AI calls an
 * overall deadline").
 *
 * The unit being bounded is the OPERATION, not the attempt. A per-attempt timeout is the bug this
 * replaces, because the attempts multiply: the Vercel AI SDK's `generateObject` defaults to
 * `maxRetries: 2` (three attempts) with exponential backoff from 2s, and it honours a provider's
 * `Retry-After` header for delays up to 60s per retry; `generateStructured` then repeats that whole
 * sequence against `AI_MODEL_FALLBACK`. Six provider calls and several minutes of pure sleeping are
 * reachable from one `generateAi()` call, and a per-attempt timeout of T bounds none of it — it
 * bounds 6T plus the backoff. Only a clock started once, before the first attempt, bounds the slot.
 *
 * The budget is expressed as an `AbortSignal` rather than a `Promise.race`, so it reaches the
 * provider's `fetch` and cancels the in-flight HTTP request. A race would resolve the caller early
 * while the request kept running, which is exactly the held slot we are trying to give back.
 */

/** What every caller of `generateAi` may say about how long it is willing to wait. */
export interface AiCallOptions {
  /**
   * The caller's own cancellation: a job's `ctx.signal`, or a request's. Composed WITH the budget,
   * never instead of it — a caller that cancels early must win, and a caller that never cancels
   * must still hit the ceiling.
   */
  readonly signal?: AbortSignal;
  /** Override the wall-clock ceiling for this operation. Defaults to `AI_BUDGET_MS`. */
  readonly budgetMs?: number;
}

const DEFAULT_AI_BUDGET_MS = 120_000;

function readBudget(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_AI_BUDGET_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AI_BUDGET_MS;
}

/**
 * Default ceiling for one AI operation, `AI_BUDGET_MS` if set.
 *
 * 120s is chosen to sit above a healthy slow call and below every slot that holds one: the Weekly
 * Brief is the longest prompt in the app at `maxOutputTokens: 8192` and completes well inside a
 * minute, while the brief jobs allow 180s per attempt and Vercel functions cap at 300s. So the
 * budget bites on a stuck or retry-looping call and never on a merely slow one — a deadline that
 * fires during normal operation would be worse than none, because it would train people to retry.
 */
export const AI_BUDGET_MS: number = readBudget(process.env.AI_BUDGET_MS);

/** A running budget: the signal to hand downstream, and a way to tell WHY it aborted. */
export interface AiDeadline {
  /** Aborted when the budget expires or the caller cancels. Pass to every call that accepts one. */
  readonly signal: AbortSignal;
  /** True once the budget itself expired — distinguishes "we ran out of time" from "caller left". */
  readonly expired: () => boolean;
  readonly budgetMs: number;
}

/**
 * Start the clock. Call this ONCE per operation, before the first attempt — calling it per attempt
 * would reintroduce the per-attempt timeout this module exists to replace.
 */
export function startAiDeadline(opts?: AiCallOptions): AiDeadline {
  const budgetMs = opts?.budgetMs ?? AI_BUDGET_MS;
  const budget = AbortSignal.timeout(budgetMs);
  const caller = opts?.signal;
  return {
    signal: caller === undefined ? budget : AbortSignal.any([caller, budget]),
    expired: () => budget.aborted,
    budgetMs,
  };
}

function isAbortErrorShape(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  // The SDK's own shape when the signal trips between retries rather than during one. Its `name`
  // is the prefixed `AI_RetryError`, so match the suffix rather than pinning the vendor prefix.
  return err.name.endsWith("RetryError") && "reason" in err && err.reason === "abort";
}

/**
 * Whether an error is an abort rather than a provider failure.
 *
 * Checked one level into `cause` as well: a provider wraps the aborted `fetch` in its own
 * `APICallError`, so the `DOMException` the signal produced is not always the outermost error.
 */
export function isAbortError(err: unknown): boolean {
  if (isAbortErrorShape(err)) return true;
  return err instanceof Error && isAbortErrorShape(err.cause);
}
