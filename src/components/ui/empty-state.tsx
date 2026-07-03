import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Empty state — shown when a list/view has no data. Every async view uses one of
 * Skeleton (loading), EmptyState (no data), or ErrorState (failed) — CONVENTIONS §10.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-black/5 bg-white px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="text-gray">{icon}</div> : null}
      <h3 className="text-base font-semibold text-charcoal">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-gray">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
