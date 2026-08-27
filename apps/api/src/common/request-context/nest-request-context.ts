import { AsyncLocalStorage } from "node:async_hooks";
import { installRequestContext, type RequestContext } from "@destaworks/config/request-context";

/**
 * The NestJS adapter for the framework-neutral `RequestContext` port
 * (SAAS-RESTRUCTURE-PLAN 0.3) — the Nest counterpart of `apps/web/src/app/request-context.ts`.
 *
 * `packages/auth` reads headers and cookies only through that port, so porting its guards to
 * Nest is a matter of installing an adapter, not of changing the guards. Nest is a long-lived
 * multi-request process, so the adapter cannot close over one request: it reads the request out
 * of an `AsyncLocalStorage`, which is per-request by construction and cannot leak one caller's
 * headers into another caller's guard.
 *
 * Both failure modes are closed:
 *  - no adapter installed  → `requestContext()` throws (the port never falls back);
 *  - no request in scope   → `currentRequest()` throws rather than answering with empty headers.
 * A throw reaches the caller as a denial. An empty `Headers` would resolve no session, which is
 * also a denial today, but it would silently become an authentication bypass the moment anything
 * downstream treats "no headers" as "not applicable".
 */

/** The subset of an incoming HTTP request this adapter needs. Express and Fastify both satisfy it. */
export interface HttpRequestLike {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

const storage = new AsyncLocalStorage<HttpRequestLike>();

function currentRequest(): HttpRequestLike {
  const request = storage.getStore();
  if (!request) {
    throw new Error("No request is in scope for the NestJS RequestContext adapter");
  }
  return request;
}

function toHeaders(raw: Readonly<Record<string, string | string[] | undefined>>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else {
      headers.append(name, value);
    }
  }
  return headers;
}

function headerValue(
  raw: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = raw[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** The adapter itself. Every read resolves against the request currently in `AsyncLocalStorage`. */
export const nestRequestContext: RequestContext = {
  headers: async () => toHeaders(currentRequest().headers),
  cookie: async (name) => readCookie(headerValue(currentRequest().headers, "cookie"), name),
};

/**
 * Install the adapter for this process. Call once at bootstrap, before the server accepts traffic.
 * Deliberately not a module side effect and deliberately not called from a guard: if bootstrap
 * forgets it, every guarded request fails loudly rather than one quietly resolving no session.
 */
export function installNestRequestContext(): void {
  installRequestContext(nestRequestContext);
}

/** Run `fn` with `request` as the one the adapter answers for. Nesting the same request is safe. */
export function runWithRequestContext<T>(request: HttpRequestLike, fn: () => T): T {
  return storage.run(request, fn);
}
