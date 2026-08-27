import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { RATE_LIMIT_METADATA, type RateLimitRule } from "../decorators/rate-limit.decorator";
import type { AuthenticatedRequest, PortalRequest } from "./authenticated-request";

/**
 * Applies a handler's `@RateLimit(...)` rule through the shared limiter.
 *
 * Transport only: the limiter itself is imported, so the Upstash backing, the in-memory fallback,
 * the thresholds and its deliberate fail-open on a Redis outage are unchanged and undivided.
 *
 * The key mirrors what the Next.js routes already build — `name:userId` for an authenticated
 * caller, the bare bucket `name` for an anonymous one (what `portal-access` uses). It therefore
 * expects to run after `SessionAuthGuard`/`PortalAuthGuard`; ordered before them, a rule that
 * should have been per-user degrades to a shared bucket rather than to no limit.
 *
 * A handler with no rule is not rate limited, matching a Next.js route that never calls the
 * limiter. Unlike `CapabilityGuard`'s missing capability this is not an authorization hole: rate
 * limiting is an abuse control, and the limiter fails open by design anyway.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule === undefined) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & PortalRequest>();
    const identity = request.user?.id ?? request.portal?.contactId;
    const key = identity === undefined ? rule.name : `${rule.name}:${identity}`;
    await checkRateLimit(key, { limit: rule.limit, windowMs: rule.windowMs });
    return true;
  }
}
