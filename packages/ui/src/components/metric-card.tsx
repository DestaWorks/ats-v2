import { cn } from "@destaworks/domain/utils/cn";

/** The accent a metric carries. One vocabulary so two screens cannot tint the same figure differently. */
export type MetricAccent = "navy" | "purple" | "teal" | "green" | "orange" | "red";

const ACCENT_BAR: Record<MetricAccent, string> = {
  navy: "bg-navy",
  purple: "bg-purple",
  teal: "bg-teal",
  green: "bg-green",
  orange: "bg-orange",
  red: "bg-red",
};

const ACCENT_TEXT: Record<MetricAccent, string> = {
  navy: "text-navy",
  purple: "text-purple",
  teal: "text-teal",
  green: "text-green",
  orange: "text-orange",
  red: "text-red",
};

/**
 * One figure, with its label, an optional qualifier, and an optional period-over-period delta.
 *
 * Shared rather than restyled per screen: the daily auto-capture tiles and the period summary were
 * two different cards showing the same KIND of thing, so the same number looked like two different
 * measurements depending on which range you were on.
 *
 * `delta` must be REAL period-over-period data. Pass `null` when there is no prior period to
 * compare against — an absent chip reads as "no comparison", where "0%" asserts a flat trend.
 */
export function MetricCard({
  label,
  value,
  accent = "navy",
  icon,
  sub,
  delta,
  className,
}: {
  label: string;
  value: number | string;
  accent?: MetricAccent;
  /** A short glyph shown in a tinted badge. Decorative — never the only carrier of meaning. */
  icon?: string;
  /** A qualifier under the number, e.g. a rate or the target it is measured against. */
  sub?: string;
  delta?: { label: string; direction: "up" | "down" } | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-black/5 bg-white shadow-card",
        className,
      )}
    >
      <div aria-hidden className={cn("h-1 w-full", ACCENT_BAR[accent])} />
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-gray uppercase">{label}</p>
          {icon !== undefined && (
            <span
              aria-hidden
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs",
                ACCENT_TEXT[accent],
                "bg-black/[0.04]",
              )}
            >
              {icon}
            </span>
          )}
        </div>
        <p className={cn("font-serif text-2xl leading-none font-bold", ACCENT_TEXT[accent])}>
          {value}
        </p>
        {sub !== undefined && <p className="text-xs text-gray">{sub}</p>}
        {delta !== undefined && delta !== null && (
          <p className="text-xs font-semibold">
            <span className={delta.direction === "up" ? "text-green" : "text-red"}>
              {delta.label}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
