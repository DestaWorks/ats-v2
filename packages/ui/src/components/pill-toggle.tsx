import { Button } from "./button";

/**
 * A multi-select pill grid — click a pill to add/remove it from `selected`. Shares the same
 * toggle-pill visual language as `app/(app)/lib/filter-chip.tsx`'s `FilterChip` (built on the same
 * `Button` primitive, `rounded-full`, `aria-pressed`), but lives here as a generic
 * `components/ui/` primitive since it's not filter-toolbar-specific — the Screening scorecard
 * (Wave 3.3) is its first consumer, for the credentials/states/schedule sections.
 */
export function PillToggle({
  options,
  selected,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  ariaLabel?: string;
}) {
  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const pressed = selected.includes(opt.value);
        return (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={pressed ? "primary" : "secondary"}
            aria-pressed={pressed}
            onClick={() => toggle(opt.value)}
            className="rounded-full"
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
