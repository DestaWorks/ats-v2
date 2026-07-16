"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/error-state";

/**
 * Error boundary for the intercepted candidate-detail modal — sibling to `loading.tsx`. Without
 * this, a thrown error during `loadCandidateDetail` (or anywhere in `CandidateDetail`) had NO
 * boundary anywhere in the app to catch it, so the dialog stayed on `loading.tsx`'s skeleton
 * forever with no way to retry or dismiss — indistinguishable, from the user's side, from a slow
 * network. `reset()` re-runs the segment (server-first: the failure may have been a transient DB
 * blip); "Close" falls back to `router.back()`, matching `RouteModal`'s own dismiss — this
 * component can't rely on `RouteModal` being mounted, since an error here means `page.tsx` (which
 * renders `RouteModal`) never got to return anything.
 */
export default function InterceptedDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Candidate detail modal failed to load:", error);
  }, [error]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Candidate detail failed to load"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <ErrorState
          title="Couldn't load this candidate"
          message="Something went wrong loading the detail view. Try again, or close and reopen it from the list."
          onRetry={reset}
        />
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm font-semibold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
