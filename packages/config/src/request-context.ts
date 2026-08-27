/**
 * The request-scoped inputs the auth layer needs, expressed with no web framework in it
 * (SAAS-RESTRUCTURE-PLAN 0.3). `server/auth` depends on this interface only; the concrete
 * Next.js implementation (`app/request-context.ts`) is installed at the app edge and never
 * imported from `server/`.
 */
export interface RequestContext {
  /** The incoming request's headers. */
  headers(): Promise<Headers>;
  /** One incoming request cookie's value, or `undefined` when it isn't set. */
  cookie(name: string): Promise<string | undefined>;
}

/** Held on `globalThis` so a bundler that emits the module more than once still sees one adapter. */
const SLOT = Symbol.for("destaworks.request-context");

type Slot = { [SLOT]?: RequestContext };

/** Install the adapter for this runtime. The app edge calls this; nothing under `server/` does. */
export function installRequestContext(context: RequestContext): void {
  (globalThis as Slot)[SLOT] = context;
}

/** The installed adapter. Throws — never falls back — when the edge failed to install one. */
export function requestContext(): RequestContext {
  const context = (globalThis as Slot)[SLOT];
  if (!context) {
    throw new Error("No RequestContext adapter installed for this runtime");
  }
  return context;
}
