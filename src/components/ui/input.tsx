import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Shared form-control classes — the rounded border + navy focus ring worn by every text control.
 * Extracted from the ~8 hand-rolled copies the DRY audit flagged. Exported for the rare control
 * that needs a different padding/width than the field primitives (auth cards, file inputs), so the
 * one canonical string still lives in exactly one place.
 */
export const controlClass =
  "rounded-md border border-black/15 focus:ring-2 focus:ring-navy focus:outline-none";

/** The canonical field look layered on `controlClass`: full-width, standard padding, dims disabled. */
export const fieldClass = cn(controlClass, "w-full px-2.5 py-1.5 text-sm disabled:opacity-50");

/**
 * Text input primitive. Reproduces the exact class set the detail/resume forms hand-rolled; merges
 * `className` last so callers can add layout/size utilities (`max-w-xs`, `resize-y`, …). Spreads
 * native `<input>` props and forwards a ref.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClass, className)} {...props} />;
  },
);
