import { scrubBreadcrumb, scrubEvent } from "@/lib/monitoring/sentry-scrub";

/**
 * Browser error tracking (Sentry) — activate-by-key; a blank `NEXT_PUBLIC_SENTRY_DSN` means this
 * whole file is a no-op and nothing changes for anyone (same posture as every other optional
 * integration in this app). See `src/instrumentation.ts` for the server/edge half and
 * `lib/monitoring/sentry-scrub.ts` for why every event/breadcrumb is scrubbed before it leaves
 * the browser, not after.
 *
 * The SDK is DYNAMICALLY imported, not `import * as Sentry from "@sentry/nextjs"` at the top of
 * the file — a static import bundles the full client SDK into every page's first-load JS
 * regardless of whether `if (dsn)` ever runs (measured: ~85KB added, unconditionally, in an app
 * where this is off almost everywhere). `import()` defers fetching that chunk entirely until a
 * DSN is actually present, so an unconfigured environment pays zero bundle cost, not just zero
 * runtime cost.
 *
 * Deliberately NOT enabled:
 * - Session Replay — recording DOM snapshots of an app whose screens are full of candidate
 *   PII/PHI is exactly the risk this integration exists to avoid, not something to opt into.
 * - Performance tracing (`tracesSampleRate`) / router-transition instrumentation — out of scope
 *   for "add error tracking"; can be added later as its own deliberate decision if actually
 *   needed (that's also why `onRouterTransitionStart` isn't exported here — Next.js's own
 *   `require-instrumentation-client` loader treats it as optional, not a required hook).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      sendDefaultPii: false,
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  });
}
