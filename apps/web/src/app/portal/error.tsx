"use client";

import { useEffect } from "react";
import { ErrorState } from "@destaworks/ui/error-state";
import { logger } from "@destaworks/config/logger";

/**
 * Client Portal boundary. The audience is an external client contact, not staff — so the copy
 * offers the one thing they can actually do (retry, then contact their recruiter) and names no
 * internal system, no code and no candidate. `digest` is the only identifier shown, and it is a
 * hash their recruiter can match against our logs.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("portal.boundary.render_failed", {
      errorType: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6">
      <ErrorState
        title="We couldn't load your portal"
        message="Your information is safe — we just couldn't reach it right now. Try again in a moment, or contact your recruiter if this keeps happening."
        onRetry={reset}
      />
      {error.digest ? (
        <p className="text-center text-xs text-gray">Reference {error.digest}</p>
      ) : null}
    </div>
  );
}
