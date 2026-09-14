import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import { AppError } from "./app-error";
import { logger } from "@destaworks/config/logger";

/**
 * Rate limiting, shared across processes when `REDIS_URL` is set and per-process otherwise.
 *
 * Redis rather than a hosted limiter because the keys are `rule:userId` and `rule:ip:<address>` —
 * identifiers, on a system holding candidate PII. Sending those to a third party would make that
 * vendor a business associate for the sake of a counter this app can keep itself, on a container
 * it already runs.
 *
 * The in-memory path below is NOT a degraded mode when there is a single process: the count is
 * exact, and the window slides. It stops being correct the moment a second instance exists, and
 * it does so SILENTLY — every limit quietly becomes `limit x instances`, including Better Auth's
 * sign-in brute-force protection. That is the reason to run Redis before scaling out, not after.
 */
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const redisUrl = process.env.REDIS_URL;

/** True when limits are shared across processes. False means per-process, which one instance is. */
export const rateLimitEnabled: boolean = Boolean(redisUrl);

if (!rateLimitEnabled && process.env.NODE_ENV === "production") {
  logger.warn("rate_limit.redis.not_configured", {
    fallback: "in-memory",
    note: "exact for a single instance; limits multiply once more than one process runs",
  });
}

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

/** One connection per process, shared. `connecting` collapses a concurrent first call into one. */
function getClient(): Promise<RedisClientType> {
  if (client?.isReady) return Promise.resolve(client);
  connecting ??= (async () => {
    // `redisUrl` is defined here — `rateLimitEnabled` gates every path that reaches this — but
    // `exactOptionalPropertyTypes` will not accept a possibly-undefined `url`, so it is narrowed
    // rather than asserted.
    if (redisUrl === undefined) throw new Error("REDIS_URL is not set");
    const created: RedisClientType = createClient({ url: redisUrl });
    created.on("error", (err: unknown) => {
      const errorType = err instanceof Error ? err.name : "UnknownError";
      logger.warn("rate_limit.redis.client_error", { errorType });
    });
    await created.connect();
    client = created;
    return created;
  })();
  return connecting;
}

const hits = new Map<string, number[]>();

/**
 * Keys are only pruned when touched again, so one never revisited would live for the life of the
 * process. Anonymous callers are keyed by an `x-forwarded-for` address, which the CLIENT controls,
 * so a forged header per request would otherwise grow this map without bound on an
 * unauthenticated endpoint.
 *
 * The sweep runs only past the cap, so the normal path stays O(1). `MAX_WINDOW_MS` sits far above
 * any rule's window, so an entry older than it cannot affect a decision whichever rule wrote it.
 * Redis needs none of this — keys carry a TTL and expire themselves.
 */
const MAX_TRACKED_KEYS = 20_000;
const MAX_WINDOW_MS = 60 * 60 * 1000;

function sweepExpired(now: number): void {
  for (const [key, times] of hits) {
    const newest = times[times.length - 1];
    if (newest === undefined || newest <= now - MAX_WINDOW_MS) hits.delete(key);
  }
}

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
  if (hits.size > MAX_TRACKED_KEYS) sweepExpired(now);
}

const REDIS_PREFIX = "ratelimit:";

/**
 * A sliding window in a sorted set, scored by timestamp.
 *
 * Drop what has aged out, add this attempt, count, and set the key to expire — in one MULTI, so a
 * concurrent caller cannot read a half-applied state. A rejected attempt is then REMOVED, so being
 * refused does not itself consume a slot, matching the in-memory behaviour.
 *
 * `pExpire` on every write is what makes this self-cleaning: an idle key disappears on its own
 * after one window, so no eviction pass is needed and a forged-key flood costs Redis one window's
 * memory rather than the process's lifetime.
 */
async function checkRateLimitInRedis(key: string, opts: RateLimitOptions): Promise<void> {
  const redis = await getClient();
  const now = Date.now();
  const namespaced = REDIS_PREFIX + key;
  const member = `${now}-${randomUUID()}`;

  const results = await redis
    .multi()
    .zRemRangeByScore(namespaced, 0, now - opts.windowMs)
    .zAdd(namespaced, { score: now, value: member })
    .zCard(namespaced)
    .pExpire(namespaced, opts.windowMs)
    .exec();

  const count = Number(results[2]);
  if (count > opts.limit) {
    await redis.zRem(namespaced, member);
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests — please slow down and try again shortly.",
    );
  }
}

export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<void> {
  if (!rateLimitEnabled) {
    checkRateLimitInMemory(key, opts);
    return;
  }
  try {
    await checkRateLimitInRedis(key, opts);
  } catch (err) {
    // A refusal is the point; only an INFRASTRUCTURE failure falls through.
    if (err instanceof AppError) throw err;
    // Fail OPEN: a Redis outage should degrade rate limiting, not take the endpoint down with it.
    const errorType = err instanceof Error ? err.name : "UnknownError";
    logger.warn("rate_limit.redis.unavailable", { errorType, outcome: "fail-open" });
  }
}

export function __resetRateLimit(): void {
  hits.clear();
}

/** How many keys the in-memory limiter holds. Exists so a test can prove eviction happens. */
export function trackedKeyCount(): number {
  return hits.size;
}

/** Close the shared connection. Called by the process shutdown path, and by tests. */
export async function shutdownRateLimit(): Promise<void> {
  const existing = client;
  client = null;
  connecting = null;
  if (existing?.isOpen) await existing.quit();
}
