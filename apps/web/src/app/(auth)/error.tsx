"use client";

import { useEffect } from "react";
import { Button } from "@destaworks/ui/button";
import { logger } from "@destaworks/config/logger";

/**
 * Boundary for the signed-out screens. Kept in the dark `AuthShell` palette rather than reusing
 * the app-shell card, because this is the first screen a locked-out user sees and dropping them
 * onto a differently-styled page reads as "wrong site" rather than "try again".
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("web.auth_boundary.render_failed", {
      errorType: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#0a0a1a_0%,#0f1628_40%,#151015_100%)] p-4">
      <div className="relative z-10 flex w-full max-w-[420px] flex-col gap-4 text-center">
        <div>
          <p className="font-serif text-[13px] tracking-[0.35em] text-brand">DESTA WORKS</p>
          <p className="mt-1 font-serif text-2xl text-ivory">DestaHealth ATS</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-7">
          <h1 className="text-base font-semibold text-ivory">Something went wrong</h1>
          <p className="mt-2 text-sm text-ivory/50">
            We couldn&rsquo;t reach the sign-in service. This is usually temporary — try again in a
            moment.
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
      </div>
    </div>
  );
}
