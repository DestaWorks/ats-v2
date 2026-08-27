import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/monitoring/sentry-scrub";

/**
 * Server + edge error tracking (Sentry) — activate-by-key, same dormant-until-configured posture
 * as every other optional integration in this app (`aiEnabled`, `storageEnabled`, `emailEnabled`,
 * `googleEnabled`). `NEXT_PUBLIC_SENTRY_DSN` is intentionally the ONE var shared by client/server/
 * edge (Sentry DSNs are write-only ingest keys, safe to expose — not a secret like an API key),
 * so there's a single source of truth instead of three DSNs that can drift.
 *
 * Every event/breadcrumb — from any of the three runtimes — passes through `scrubEvent`/
 * `scrubBreadcrumb` (`lib/monitoring/sentry-scrub.ts`) before it leaves the process; see that
 * file for why this is mandatory in an app carrying candidate PII/PHI, not optional hardening.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/app/request-context");
    const { installNodeLogger } = await import("@/server/logging/install");
    installNodeLogger();
  }

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const shared = {
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(shared);
  } else if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(shared);
  }
}

/** Captures the uncaught render/data-fetch errors Next.js's own instrumentation hook surfaces
 *  (App Router server components, route handlers, server actions) — routed through the SAME
 *  scrubbed client `register()` initialized above, so no separate scrubbing path to keep in
 *  sync. A no-op call when Sentry was never initialized (DSN unset). */
export const onRequestError = Sentry.captureRequestError;
