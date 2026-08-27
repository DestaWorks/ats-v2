import type { ComponentType, SVGProps } from "react";
import { cn } from "@destaworks/domain/utils/cn";
import { Card } from "@destaworks/ui/card";
import { TrendChip } from "@destaworks/ui/trend-chip";

export type StatCardTone = "default" | "red" | "orange" | "green" | "teal";

const TONE_CLASS: Record<StatCardTone, string> = {
  default: "text-navy",
  red: "text-red",
  orange: "text-orange",
  green: "text-green",
  teal: "text-teal",
};

/** Matching tinted-badge background per tone (design pass 2026-08-03 — icon badge). */
const TONE_BADGE_CLASS: Record<StatCardTone, string> = {
  default: "bg-navy/10 text-navy",
  red: "bg-red/10 text-red",
  orange: "bg-orange/10 text-orange",
  green: "bg-green/10 text-green",
  teal: "bg-teal/10 text-teal",
};

/**
 * A single headline stat (label + big number), optionally tinted for emphasis.
 *
 * `icon` and `trend` (design pass 2026-08-03) are both OPTIONAL — every existing call site keeps
 * rendering exactly as before (label + number only); pass them to opt into the tinted icon badge
 * / delta-chip idiom the reference dashboards use. `trend` must be REAL period-over-period data —
 * never pass a fabricated value.
 */
export function StatCard({
  label,
  value,
  tone = "default",
  icon: Icon,
  trend,
}: {
  label: string;
  value: number;
  tone?: StatCardTone;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  trend?: { direction: "up" | "down"; label: string };
}) {
  const valueClass = TONE_CLASS[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
        {Icon ? (
          <span aria-hidden className={cn("rounded-lg p-1.5", TONE_BADGE_CLASS[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p className={cn("text-2xl font-bold", valueClass)}>{value}</p>
        {trend ? <TrendChip direction={trend.direction} label={trend.label} /> : null}
      </div>
    </Card>
  );
}
