import type { ChangeEvent, ReactNode } from "react";
import { TAGS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Popover } from "@/components/ui/popover";
import { FilterChip } from "./filter-chip";

/**
 * Presentational shell for the browse toolbars (candidates list + pipeline board). `FilterToolbar`
 * lays out a left-pinned search box and a right-pushed control cluster (space-between, wrapping below
 * search on mobile); `FiltersPopover` is the "Filters" button + panel with an active-count badge;
 * `FilterField` is a labeled `<select>`; `TagFilter` is the any-of tag chip block. The pages own their
 * chips/fields and the URL wiring (see `useUrlFilters`) — these carry no state.
 */

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray"
    >
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="m17 17-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FilterToolbar({
  search,
  onSearchChange,
  placeholder = "Search name or email…",
  searchLabel = "Search candidates",
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  searchLabel?: string;
  /** The right-pushed control cluster — quick chips, a `<FiltersPopover>`, a Clear button, … */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search — pinned left at a fixed width (the control cluster is pushed right, space-between). */}
      <div className="relative w-full sm:w-80">
        <SearchIcon />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          className="w-full rounded-md border border-black/10 bg-white py-1.5 pr-2.5 pl-8 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
        />
      </div>

      {/* Control cluster — pushed to the right edge on wider screens (wraps below search on mobile). */}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{children}</div>
    </div>
  );
}

export function FiltersPopover({ count, children }: { count: number; children: ReactNode }) {
  return (
    <Popover
      align="end"
      panelClassName="w-72"
      trigger={(open) => (
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition " +
            (count || open
              ? "border-navy/30 bg-navy/10 text-navy"
              : "border-black/15 text-charcoal hover:bg-black/5")
          }
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4">
            <path
              d="M3 5h14M6 10h8M8.5 15h3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Filters
          {count ? (
            <Badge tone="navy" size="sm">
              {count}
            </Badge>
          ) : null}
        </span>
      )}
    >
      {() => <div className="flex flex-col gap-3">{children}</div>}
    </Popover>
  );
}

export function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  /** The `<option>`s. */
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
      {label}
      <select
        value={value}
        onChange={onChange}
        className="w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export function TagFilter({
  active,
  onToggle,
}: {
  active: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-charcoal">Tags</span>
      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((tag) => (
          <FilterChip key={tag} pressed={active.includes(tag)} onToggle={() => onToggle(tag)}>
            {tag}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
