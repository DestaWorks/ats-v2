import { safePathname } from "@destaworks/integrations/http/safe-pathname";

/**
 * The narrow slices of the underlying HTTP objects the cross-cutting classes touch, and the
 * request-id stamp they share. Declared structurally rather than as `express.Request`/`Response`
 * so the filter and the interceptors stay testable with a plain object and survive a swap of the
 * HTTP adapter.
 */

/** What the interceptors read off an incoming request. */
export interface HttpRequestLike {
  readonly method?: string | undefined;
  /** Node/Express server-relative target, e.g. `/api/candidates?q=jane`. */
  readonly url?: string | undefined;
  /** Express's pre-rewrite target; preferred when present so mounts do not truncate the path. */
  readonly originalUrl?: string | undefined;
}

/** What the exception filter writes to an outgoing response. */
export interface HttpResponseLike {
  status(code: number): unknown;
  json(body: unknown): unknown;
}

/** Non-enumerable so the id never rides along into a `JSON.stringify` of the request object. */
const REQUEST_ID = Symbol.for("destaworks.api.requestId");

/**
 * Stamp the correlation id on the request. Nest runs exception filters OUTSIDE the interceptor
 * chain, so the filter cannot rely on the interceptor's AsyncLocalStorage scope still being
 * entered; the stamp is what guarantees it resolves the SAME id instead of minting a second one.
 */
export function attachRequestId(request: object, requestId: string): void {
  Object.defineProperty(request, REQUEST_ID, {
    value: requestId,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/** The id stamped by `attachRequestId`, or `undefined` if the interceptor never ran. */
export function readRequestId(request: object): string | undefined {
  const value: unknown = Reflect.get(request, REQUEST_ID);
  return typeof value === "string" ? value : undefined;
}

/** Base for resolving a server-relative target; only the pathname is ever read back out. */
const RELATIVE_BASE = "http://localhost";

/** Method plus query-free pathname — the two request facts a log line is allowed to carry. */
export function describeRequest(request: HttpRequestLike): { method: string; route: string } {
  return {
    method: request.method ?? "UNKNOWN",
    route: safePathname(request.originalUrl ?? request.url ?? "", RELATIVE_BASE),
  };
}
