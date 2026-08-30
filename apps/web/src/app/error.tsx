"use client";

import { useEffect } from "react";
import { Button } from "@destaworks/ui/button";
import { logger } from "@destaworks/config/logger";

/**
 * The outermost boundary that still has the root layout around it. It exists for the one failure
 * `(app)/error.tsx` cannot catch: `(app)/layout.tsx` fetches the client list over HTTP before it
 * renders anything, and a layout's own error belongs to its PARENT boundary — so with the API
 * unreachable the app shell never renders and this is what the user gets instead of `global-error`
 * stripping the page down to bare markup.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("web.root_boundary.render_failed", {
      errorType: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface/40 p-6">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white p-8 text-center">
        <p className="font-serif text-[11px] tracking-[0.3em] text-brand">DESTA WORKS</p>
        <h1 className="mt-3 text-lg font-bold text-navy">We couldn&rsquo;t load the app</h1>
        <p className="mt-2 text-sm text-gray">
          The server didn&rsquo;t respond. This is usually temporary — try again in a moment.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </div>
        {error.digest ? (
          <p className="mt-6 text-[11px] text-gray">Reference {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
