"use client";

import { LEAD_STATUSES, SOURCES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterField, FilterToolbar, FiltersPopover } from "../lib/filter-toolbar";
import { useUrlFilters } from "../lib/use-url-filters";

/**
 * Status / source / search filters for the `/sourcing` inventory — built on the shared
 * `FilterToolbar`/`useUrlFilters` primitives (same bar as the candidates list + pipeline board). All
 * state lives in the URL `searchParams` (shareable); each change `router.replace`s the URL, the RSC
 * re-reads page 1 of the (keyset) list, and the list is remounted (keyed on the filter signature) so
 * it re-seeds. Status + Source are dropdowns in the popover (the server matches source on exact
 * equality); free-text search is debounced (~300ms). Client component — imports no `src/server/**`.
 */
export function LeadFilters() {
  const f = useUrlFilters();

  const status = f.get("status");
  const source = f.get("source");

  const popoverCount = (status ? 1 : 0) + (source ? 1 : 0);
  const hasFilters = Boolean(popoverCount || f.get("search"));

  return (
    <FilterToolbar search={f.search} onSearchChange={f.setSearch} searchLabel="Search leads">
      <FiltersPopover count={popoverCount}>
        <FilterField
          label="Status"
          value={status}
          onChange={(e) => f.setParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterField>

        <FilterField
          label="Source"
          value={source}
          onChange={(e) => f.setParam("source", e.target.value)}
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterField>
      </FiltersPopover>

      {hasFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={f.clearAll}>
          Clear
        </Button>
      ) : null}
    </FilterToolbar>
  );
}
