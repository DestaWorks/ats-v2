import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Small status/label pill. Extracted from the count pills, timing badges
 * (overdue / stuck) and label chips scattered across the pipeline & board. Generic
 * on purpose: `tone` maps to the existing tinted color pairs, and callers that need
 * a bespoke color (e.g. the pipeline track chip keyed off `status-style.ts`) pass it
 * through `className` — no pipeline statuses are hardcoded here.
 *
 * `pill` (default) is fully rounded; pass `pill={false}` for the lightly-rounded
 * rectangular badges (timing chips). `className` is merged last for overrides.
 */

export type BadgeTone = "neutral" | "navy" | "success" | "amber" | "danger";
export type BadgeSize = "sm" | "md";

/** Tinted bg + text per tone (matches the existing inline usages). */
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-black/5 text-gray",
  navy: "bg-navy/15 text-navy",
  success: "bg-green/15 text-green",
  amber: "bg-orange/10 text-orange",
  danger: "bg-red/10 text-red",
};

/** Padding per size (both share the [11px] text used by the current badges). */
const SIZE: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-[11px]",
  md: "px-2 py-0.5 text-[11px]",
};

export function Badge({
  tone = "neutral",
  size = "md",
  pill = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  size?: BadgeSize;
  pill?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold",
        pill ? "rounded-full" : "rounded",
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
