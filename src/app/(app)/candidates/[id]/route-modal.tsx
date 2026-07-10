"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Dialog chrome for ROUTE-intercepted content (the candidate detail opened in-app). Unlike the
 * shared `Modal` (local open state), this closes by NAVIGATING BACK — the URL is the state, so
 * Escape/backdrop/× restore the exact board/list the user came from (scroll + filters intact,
 * still mounted underneath the parallel-route overlay). Body scroll locks while open; the panel
 * itself scrolls. Minimal a11y contract: `role="dialog"` + `aria-modal`, close button focused on
 * mount so keyboard users can dismiss immediately.
 */
export function RouteModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => router.back(), [router]);

  // Parallel-slot gotcha: on SOFT navigation elsewhere (e.g. "← Back to board" inside the
  // detail) the @modal slot keeps its previous state — self-hide whenever the URL no longer
  // points at a candidate detail, so a stale overlay can never shadow the new view.
  const active = /^\/candidates\/[^/]+/.test(pathname);

  useEffect(() => {
    if (!active) return;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [close, active]);

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Candidate detail"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl rounded-2xl bg-surface/95 shadow-2xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm font-semibold text-charcoal transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
        >
          Close
        </button>
        {children}
      </div>
    </div>
  );
}
