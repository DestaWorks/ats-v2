import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { AppError } from "./app-error";

// Upstash-backed when UPSTASH_REDIS_REST_URL/TOKEN are set; falls back to in-memory otherwise.
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const rateLimitEnabled: boolean = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

if (!rateLimitEnabled && process.env.NODE_ENV === "production") {
  console.error(
    "checkRateLimit: UPSTASH_REDIS_REST_URL/TOKEN not set in production — falling back to the " +
      "per-instance in-memory limiter (no cross-instance protection).",
  );
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

const limiters = new Map<string, Ratelimit>();
function getLimiter(opts: RateLimitOptions): Ratelimit {
  const cacheKey = `${opts.limit}:${opts.windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(opts.limit, `${Math.round(opts.windowMs / 1000)} s`),
      analytics: false,
      prefix: "ratelimit",
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

const hits = new Map<string, number[]>();

function checkRateLimitInMemory(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= opts.limit) {
    hits.set(key, recent);
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests — please slow down and try again shortly.",
    );
  }
  recent.push(now);
  hits.set(key, recent);
}

export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<void> {
  if (!rateLimitEnabled) {
    checkRateLimitInMemory(key, opts);
    return;
  }
  let success: boolean;
  try {
    ({ success } = await getLimiter(opts).limit(key));
  } catch (err) {
    // Fail OPEN: a Redis outage/misconfig should degrade rate limiting, not break the request.
    const name = err instanceof Error ? err.name : "UnknownError";
    console.error(`checkRateLimit: Upstash request failed (${name}) — allowing request through`);
    return;
  }
  if (!success) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests — please slow down and try again shortly.",
    );
  }
}

export function __resetRateLimit(): void {
  hits.clear();
}
