import { cn } from "@/lib/utils/cn";

/** Accessible loading spinner. Announces "Loading" to assistive tech. */
export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      <svg
        className={cn("h-5 w-5 animate-spin text-navy", className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
