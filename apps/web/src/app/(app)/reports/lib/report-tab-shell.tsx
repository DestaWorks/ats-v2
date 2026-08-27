import type { ReactNode } from "react";
import { ErrorState } from "@destaworks/ui/error-state";

/** The loading/error/data states every report tab shares — one place, not re-typed 9×. */
export function ReportTabShell<T>({
  data,
  children,
}: {
  data: T | null | undefined;
  children: (data: T) => ReactNode;
}) {
  if (data === undefined) return <p className="text-sm text-gray">Loading…</p>;
  if (data === null) {
    return <ErrorState title="Couldn't load this report" message="Please try again." />;
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
