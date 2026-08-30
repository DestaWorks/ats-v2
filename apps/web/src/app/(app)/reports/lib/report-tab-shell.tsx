import type { ReactNode } from "react";
import { ErrorState } from "@destaworks/ui/error-state";
import { messageForFailure, type ApiFailure } from "@/lib/api/client";
import { Spinner } from "@destaworks/ui/spinner";

/**
 * A failure carries a `code`; a report payload never does, so this tells the two apart without
 * either side declaring a discriminant. Reports render nine tabs off one filter bar — before, a
 * single unreachable API turned all nine into the same blank "Please try again", which reads as
 * nine broken reports rather than one unreachable server.
 */
function isFailure<T>(value: T | ApiFailure): value is ApiFailure {
  return typeof value === "object" && value !== null && "code" in value && "issues" in value;
}

/** The loading/error/data states every report tab shares — one place, not re-typed 9×. */
export function ReportTabShell<T>({
  data,
  children,
}: {
  data: T | ApiFailure | undefined;
  children: (data: T) => ReactNode;
}) {
  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray">
        <Spinner /> Loading…
      </p>
    );
  }
  if (isFailure(data)) {
    return <ErrorState title="Couldn't load this report" message={messageForFailure(data)} />;
  }
  return <>{children(data)}</>;
}

/** A simple horizontal bar (count vs. a max) — the shared visual idiom for distribution rows. */
export function Bar({ pct, className = "bg-navy" }: { pct: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
