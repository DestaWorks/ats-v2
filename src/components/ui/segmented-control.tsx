import { cn } from "@/lib/utils/cn";

/** One choice in a `SegmentedControl`. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Pill-group filter (design pass 2026-08-03) — the segmented "All / Residential / Commercial…"
 * or "Today / This week / This month" idiom every reference dashboard uses for a small, mutually
 * exclusive filter set, instead of a `<Select>` dropdown. Same visual language as `DetailTabs`'
 * tablist (filled navy pill on a light track) so it reads as one design system, not a competing
 * control. Controlled, `{value, onChange, options}` API — no internal state.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap gap-1 self-start rounded-full bg-black/[0.04] p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold transition",
              "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
              active ? "bg-navy text-white shadow-sm" : "text-gray hover:text-charcoal",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
