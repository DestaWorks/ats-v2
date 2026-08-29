import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { requestContext } from "@destaworks/config/request-context";
import { TENANT_COOKIE } from "@destaworks/domain/constants";
import { readTenantClaim } from "@destaworks/auth/tenant-claim";
import { requireTenantContext } from "@destaworks/auth/tenant-context";
import { AppError } from "@destaworks/integrations/http/app-error";
import { runWithRequestContext } from "../request-context/nest-request-context";
import type { TenantScopedRequest } from "./authenticated-request";

/**
 * Resolves the active tenant and attaches it as `request.tenant` (SAAS-RESTRUCTURE-PLAN 6.5).
 *
 * Stacked AFTER `SessionAuthGuard` — `@UseGuards(SessionAuthGuard, TenantGuard)` — because a
 * tenant is resolved for a known person, never for an anonymous request. It reads the principal
 * that guard already put on the request and resolves nothing itself; if the guard is missing it
 * refuses rather than proceeding with an unauthenticated claim.
 *
 * The transport's whole job here is to gather three request facts — host, path, cookie — and hand
 * them to `readTenantClaim`. It makes no decision: the claim goes to `requireTenantContext`, which
 * is the single verification path shared with every other entry point. Adding a fourth source, or
 * changing the precedence, is a change to `packages/auth/src/tenant-claim.ts` and to nothing here.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantScopedRequest>();
    const user = request.user;
    if (!user) throw new AppError("UNAUTHORIZED", "Sign in required");

    request.tenant = await runWithRequestContext(request, async () => {
      const claim = readTenantClaim({
        host: headerValue(request.headers, "host"),
        // `originalUrl` first: behind a mount, `url` is already stripped of the prefix, and a
        // truncated path would drop a `/t/<slug>` claim without any error to notice.
        path: request.originalUrl ?? request.url,
        cookie: await requestContext().cookie(TENANT_COOKIE),
      });
      // `user` is an AuthContext once SessionAuthGuard has run (6.4), so hand the resolver the
      // identity half it actually takes. The context it returns is the authoritative one — the
      // tenant already on the principal was resolved from a hint and is re-verified here.
      return requireTenantContext(user.user, claim);
    });
    return true;
  }
}

/** First value of a possibly-repeated header. Repeated `Host` is malformed; the first wins. */
function headerValue(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}
