import * as Sentry from "@sentry/node";
import { scrubBreadcrumb, scrubEvent } from "@destaworks/config/monitoring/sentry-scrub";

/**
 * Error tracking for both API processes — activate-by-key, dormant until `SENTRY_DSN` is set.
 *
 * `api-exception.filter.ts` has called `Sentry.captureException` since it was written, but nothing
 * ever called `init`, so every unexpected 500 was reported nowhere: that filter deliberately logs
 * no message and no stack, because Prisma embeds field values in its errors. Without this the
 * cause of a production 500 existed in no system at all.
 *
 * Every event passes `scrubEvent`/`scrubBreadcrumb` before leaving the process — the same
 * functions the Next.js runtimes use, which is why they live in `config` rather than in one app.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
