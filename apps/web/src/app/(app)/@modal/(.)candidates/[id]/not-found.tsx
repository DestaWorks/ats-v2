"use client";

import { useRouter } from "next/navigation";
import { EmptyState } from "@destaworks/ui/empty-state";

/**
 * Sibling to this slot's `error.tsx` and `loading.tsx`. `loadCandidateDetail` turns the API's 404
 * into `notFound()`, and without a boundary in the SLOT that unwinds past the intercept: the
 * overlay disappears and the board underneath is replaced by the full-page 404, which looks like
 * the click broke the app rather than like a stale card. Dismissing returns to whatever the modal
 * was opened over, same as `RouteModal`.
 */
export default function InterceptedDetailNotFound() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Candidate not found"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <EmptyState
          title="This candidate is no longer here"
          description="It may have been deleted, moved to Trash, or it isn't something this account can open. The list may be out of date — close this and refresh."
          action={
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm font-semibold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            >
              Close
            </button>
          }
        />
      </div>
    </div>
  );
}
