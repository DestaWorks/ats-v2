import { cn } from "@destaworks/domain/utils/cn";

/**
 * A one-dimensional proportion. Not a chart — no library, no client boundary, no tooltip.
 *
 * `tone` is the caller's judgement, because "over the limit" is not always bad: a workspace past
 * its seat count is a billing conversation, not an error.
 */
export function Meter({
  value,
  max,
  tone = "navy",
  className,
}: {
  value: number;
  max: number;
  tone?: "navy" | "amber" | "danger" | "success";
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const fill = {
    navy: "bg-navy",
    amber: "bg-amber",
    danger: "bg-danger",
    success: "bg-success",
  }[tone];

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]", className)}
      role="img"
      aria-label={`${value} of ${max}`}
    >
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
