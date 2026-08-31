"use client";

import { useEffect } from "react";
import { Button } from "@destaworks/ui/button";
import { logger } from "@destaworks/config/logger";
import { AuthChrome } from "../(auth)/auth-shell";

/**
 * Boundary for the gate screens, kept because moving `/choose-workspace` out of `(auth)` would
 * otherwise drop it to the root boundary. The copy differs from `(auth)/error.tsx`: the caller
 * here is signed in and the failing call is the workspace list, not the sign-in service.
 */
export default function GateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("web.gate_boundary.render_failed", {
      errorType: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <AuthChrome>
      <div className="text-center">
        <h1 className="text-base font-semibold text-ivory">Something went wrong</h1>
        <p className="mt-2 text-sm text-ivory/50">
          We couldn&rsquo;t load your workspaces. This is usually temporary — try again in a moment.
        </p>
        <div className="mt-5 flex justify-center">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </div>
        {error.digest ? (
          <p className="mt-5 text-[11px] text-ivory/25">Reference {error.digest}</p>
        ) : null}
      </div>
    </AuthChrome>
  );
}
