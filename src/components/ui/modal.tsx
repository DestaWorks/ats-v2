"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Accessible modal built on the native `<dialog>` element. Calling `showModal()` gives us a focus
 * trap, ESC-to-close, focus-return-to-trigger, and a `::backdrop` for free — no dependencies. The
 * `open` prop drives the dialog's modal state; `onClose` fires for *every* dismissal (ESC, backdrop
 * click, or the × button) so the parent stays the single source of truth. Styled as a centered
 * `Card`-like panel with the shared theme tokens; body scroll is locked while open.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Sync the `open` prop → native modal state (imperative API, not an attribute).
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Lock body scroll behind the modal while it is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      // A modal `<dialog>` receives clicks on its own box (the backdrop area) — dismiss on those.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-black/5 bg-white p-0 text-charcoal shadow-xl backdrop:bg-black/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 border-b border-black/10 px-5 py-3">
        <h2 id={titleId} className="text-lg font-bold text-navy">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 rounded-md p-1.5 text-gray transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="h-5 w-5"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
      <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
