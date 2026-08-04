import { cn } from "@/lib/utils/cn";

/**
 * A small "▲ +5% vs last month" style delta pill (design pass 2026-08-03) — the trend-indicator
 * idiom every reference dashboard uses next to a headline number. `direction` picks the
 * arrow + tone (green/up, red/down); `label` is the rest of the text (e.g. "+12%", "-3 vs last
 * week"). Standalone (not Dashboard-only) so Reports/CRM can reuse it later.
 */
export function TrendChip({
  direction,
  label,
  className,
}: {
  direction: "up" | "down";
  label: string;
  className?: string;
}) {
  const tone = direction === "up" ? "bg-green/10 text-green" : "bg-red/10 text-red";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        tone,
        className,
      )}
    >
      <span aria-hidden>{direction === "up" ? "▲" : "▼"}</span>
      {label}
    </span>
  );
}
