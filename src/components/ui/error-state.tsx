import { cn } from "@/lib/utils/cn";

/**
 * Error state — shown when an async view fails to load. `onRetry` renders a retry
 * button (wire it to your query's `refetch`). Announced via role="alert".
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-red/20 bg-red/5 px-6 py-12 text-center",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-red">{title}</h3>
      {message ? <p className="max-w-sm text-sm text-charcoal">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
