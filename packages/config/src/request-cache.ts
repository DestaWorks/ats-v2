import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped memoization that works in a plain Node process.
 *
 * It replaces React's `cache()`, which only memoizes inside a React render. Since Phase 4.3
 * `apps/web` reaches data over HTTP and imports no services, so everything wrapped in `cache()`
 * ran exclusively in NestJS and the worker — where there is no render to scope to and the wrapper
 * was a no-op. The reads still worked; they simply repeated, once per call site, on every request.
 *
 * Outside a scope this calls straight through rather than throwing: a script or a test that never
 * opens one still gets correct data, just uncached.
 */
const storage = new AsyncLocalStorage<Map<string, unknown>>();

/** Open a scope. Everything memoized inside shares one cache and is discarded when it ends. */
export function runWithRequestCache<T>(fn: () => T): T {
  return storage.run(new Map(), fn);
}

/**
 * Memoize `load` for the duration of the current scope, keyed by `name` plus its argument.
 *
 * The PROMISE is cached, not the resolved value, so concurrent callers share one in-flight query
 * instead of racing to start several — which is the case that matters here, since these feed
 * `Promise.all` bundles.
 */
export function requestMemo<A extends string | number, R>(
  name: string,
  load: (arg: A) => Promise<R>,
): (arg: A) => Promise<R> {
  return (arg: A): Promise<R> => {
    const store = storage.getStore();
    if (store === undefined) return load(arg);
    const key = `${name}:${arg}`;
    const cached = store.get(key);
    if (cached !== undefined) return cached as Promise<R>;
    const pending = load(arg);
    store.set(key, pending);
    return pending;
  };
}
