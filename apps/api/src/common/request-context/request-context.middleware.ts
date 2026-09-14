import { runWithRequestCache } from "@destaworks/config/request-cache";
import { runWithRequestContext, type HttpRequestLike } from "./nest-request-context";

/**
 * Puts the incoming request into `AsyncLocalStorage` for the whole of its handling, so anything
 * downstream of the guards — controllers, and the services they call — resolves headers and
 * cookies through the same `RequestContext` port the guards use.
 *
 * Middleware, not an interceptor: Nest runs middleware *before* guards, and the guards are the
 * first thing that needs the context. The guards additionally establish it themselves, so each
 * one is correct even if this is never wired up; this exists so the context outlives `canActivate`.
 *
 * Framework-neutral by signature so it can be passed to `app.use(...)` without this file taking a
 * dependency on Express or Fastify types.
 */
export function requestContextMiddleware(
  request: HttpRequestLike,
  _response: unknown,
  next: () => void,
): void {
  // The cache scope nests inside the context scope and lives exactly as long: the reads it
  // memoizes are per-request by nature, and anything outliving the request would serve one
  // caller's tenant data to the next.
  runWithRequestContext(request, () => runWithRequestCache(next));
}
