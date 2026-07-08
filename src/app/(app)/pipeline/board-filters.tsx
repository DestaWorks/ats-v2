"use client";

import { LICENSE_STATUSES, TRACKS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterChip } from "../lib/filter-chip";
import { FilterField, FilterToolbar, FiltersPopover, TagFilter } from "../lib/filter-toolbar";
import { useUrlFilters } from "../lib/use-url-filters";

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Compact toolbar for the pipeline board — a single row (search · quick chips · a "Filters" popover),
 * built on the same shared `FilterToolbar`/`useUrlFilters` primitives as the candidates `ListFilters`.
 * Server-backed filters live in the URL `searchParams` (shareable); each change `router.replace`s and
 * the board re-fetches. There is no Status filter (the board's columns ARE the statuses) and no `page`
 * (the board paginates per column by keyset). The "Hot" lens is PAGE-LOCAL — it filters the loaded
 * cards, not a re-query — so it's owned by the board and passed in via `hotOnly`/`onToggleHot`.
 */
export function BoardFilters({
  clients,
  hotOnly,
  onToggleHot,
  hideEmpty,
  onToggleHideEmpty,
}: {
  clients: ClientOption[];
  hotOnly: boolean;
  onToggleHot: () => void;
  hideEmpty: boolean;
  onToggleHideEmpty: () => void;
}) {
  const f = useUrlFilters();

  const track = f.get("track");
  const clientId = f.get("clientId");
  const licenseStatus = f.get("licenseStatus");
  const overdue = f.flag("overdue");
  const stuck = f.flag("stuck");
  const mine = f.flag("mine");

  const popoverCount =
    (track ? 1 : 0) + (clientId ? 1 : 0) + (licenseStatus ? 1 : 0) + f.tags.length;

  const hasFilters = Boolean(popoverCount || f.get("search") || overdue || stuck || mine);

  return (
    <FilterToolbar search={f.search} onSearchChange={f.setSearch}>
      <FilterChip pressed={overdue} onToggle={() => f.toggleFlag("overdue", !overdue)}>
        Overdue
      </FilterChip>
      <FilterChip pressed={stuck} onToggle={() => f.toggleFlag("stuck", !stuck)}>
        Stuck
      </FilterChip>
      <FilterChip pressed={mine} onToggle={() => f.toggleFlag("mine", !mine)}>
        My candidates
      </FilterChip>
      {/* Page-local lens — filters the loaded cards in every column (does not re-query). */}
      <FilterChip pressed={hotOnly} onToggle={onToggleHot}>
        Hot (this page)
      </FilterChip>
      {/* Page-local view toggle — collapses 0-count columns so live stages get the width. */}
      <FilterChip pressed={hideEmpty} onToggle={onToggleHideEmpty}>
        Hide empty
      </FilterChip>

      <FiltersPopover count={popoverCount}>
        <FilterField
          label="Track"
          value={track}
          onChange={(e) => f.setParam("track", e.target.value)}
        >
          <option value="">All tracks</option>
          {TRACKS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </FilterField>

        <FilterField
          label="Client"
          value={clientId}
          onChange={(e) => f.setParam("clientId", e.target.value)}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterField>

        <FilterField
          label="License"
          value={licenseStatus}
          onChange={(e) => f.setParam("licenseStatus", e.target.value)}
        >
          <option value="">All licenses</option>
          {LICENSE_STATUSES.map((ls) => (
            <option key={ls} value={ls}>
              {ls}
            </option>
          ))}
        </FilterField>

        <TagFilter active={f.tags} onToggle={f.toggleTag} />
      </FiltersPopover>

      {hasFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={f.clearAll}>
          Clear
        </Button>
      ) : null}
    </FilterToolbar>
  );
}
