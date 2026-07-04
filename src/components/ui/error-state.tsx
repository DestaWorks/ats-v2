import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

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
        <Button type="button" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
