"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@destaworks/ui/error-state";
import { logger } from "@destaworks/config/logger";

/**
 * The boundary every `(app)` page falls into. Since Phase 4.3 each page reaches its data over HTTP
 * to `apps/api`, so the ordinary failures are now an unreachable API, a 502 and a cold start —
 * transient things a retry usually fixes — not a bug in the page. The copy says that, and the only
 * detail shown is `digest`: Next.js replaces a server error's message with a generic one in
 * production and gives the client this hash instead, which is also what the server-side log and
 * Sentry event carry, so it is a correlation ref that can never be a stack trace or a candidate's
 * details.
 */
export default function AppSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("web.app_boundary.render_failed", {
      errorType: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col gap-4 px-8 py-6">
      <ErrorState
        title="We couldn't load this page"
        message="The app didn't get a response from the server. This is usually temporary — try again in a moment."
        onRetry={reset}
      />
      <p className="text-center text-xs text-gray">
        {error.digest ? <>Reference {error.digest} · </> : null}
        <Link href="/dashboard" className="font-semibold text-navy hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
