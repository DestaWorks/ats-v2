import "server-only";
import { AppError } from "./app-error";

/**
 * Best-effort, IN-MEMORY rate limiter for expensive endpoints (LLM extraction, ETL commit) and the
 * public access-request flood surface.
 *
 * IMPORTANT — this is PER-INSTANCE and BEST-EFFORT: it lives in the process's memory, so it does not
 * coordinate across serverless instances / regions and resets on redeploy. That is fine as a
 * staging-safe guard, but PRODUCTION needs a SHARED store (Upstash/Redis or the platform WAF) for a
 * real, cross-instance limit. Treat this as a cheap first line of defense, not the whole story.
 *
 * Sign-in brute force is handled separately by Better Auth's built-in `rateLimit` (see
 * `server/auth/auth.ts`) — this helper is for the app-level expensive/public actions.
 */

export interface RateLimitOptions {
  /** Max allowed events within the window before further calls are rejected. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

/** key → recent event timestamps (ms). A sliding window is kept by pruning on each check. */
const hits = new Map<string, number[]>();

/**
 * Record one event for `key` and throw `AppError("RATE_LIMITED", 429)` if it exceeds `limit` within
 * `windowMs`. Callers key by user id (authenticated endpoints) or a coarse bucket (public actions).
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= opts.limit) {
    hits.set(key, recent); // persist the pruned window so it can expire
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests — please slow down and try again shortly.",
    );
  }
  recent.push(now);
  hits.set(key, recent);
}

/** Test-only: clear all recorded events so cases don't leak state into each other. */
export function __resetRateLimit(): void {
  hits.clear();
}
