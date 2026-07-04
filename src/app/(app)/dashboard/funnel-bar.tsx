import type { CandidateStatus } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { STATUS_BG } from "../pipeline/lib/status-style";

/** One funnel row: stage label + a proportional bar (stage token color) + the count. */
export function FunnelBar({
  status,
  label,
  count,
  max,
}: {
  status: CandidateStatus;
  label: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-xs font-medium text-charcoal">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-black/5">
        <div
          className={cn("h-full rounded", STATUS_BG[status])}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray">{count}</span>
    </div>
  );
}
