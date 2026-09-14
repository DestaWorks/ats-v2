import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import type { RateLimitOptions } from "@destaworks/integrations/http/rate-limit";

/** Metadata key `RateLimitGuard` reads its rule from. */
export const RATE_LIMIT_METADATA = "destaworks:rate-limit";

/** A handler's rate-limit rule: the shared bucket `name`, plus the limits from the limiter itself. */
export interface RateLimitRule extends RateLimitOptions {
  /** Bucket name, e.g. `"resume-extract"`. Combined with the caller's identity to form the key. */
  name: string;
}

/**
 * Declare a handler's rate limit — `@RateLimit({ name: "resume-extract", limit: 20, windowMs: 60_000 })`.
 *
 * `RateLimitOptions` is imported rather than restated so the limiter stays the one definition of
 * what a limit is.
 */
export const RateLimit = (rule: RateLimitRule): CustomDecorator<string> =>
  SetMetadata(RATE_LIMIT_METADATA, rule);
