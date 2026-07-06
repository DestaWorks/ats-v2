"use client";

import { ALL_STATUS_CODES, LICENSE_STATUSES, TRACKS, statusLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterChip } from "../lib/filter-chip";
import { FilterField, FilterToolbar, FiltersPopover, TagFilter } from "../lib/filter-toolbar";
import { useUrlFilters } from "../lib/use-url-filters";

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Compact toolbar for the `/candidates` browse list — a single row (search · quick chips · a
 * "Filters" popover), built on the shared `FilterToolbar`/`useUrlFilters` primitives (see also the
 * pipeline `BoardFilters`). All state lives in the URL `searchParams` (shareable); each change
 * `router.replace`s and the RSC re-reads page 1 (any filter change resets `?page` — `resetPage`). The
 * always-visible chips (Overdue · Stuck · My candidates · Hot) are DB-backed; the structured filters
 * (Track / Client / Status / License / Tags) live in the popover with an active-count badge. Sort
 * (newest/oldest/fit) is driven by the table's column headers, not here.
 */
export function ListFilters({ clients }: { clients: ClientOption[] }) {
  const f = useUrlFilters({ resetPage: true });

  const track = f.get("track");
  const clientId = f.get("clientId");
  const status = f.get("status");
  const licenseStatus = f.get("licenseStatus");
  const sort = f.get("sort") || "newest";
  const overdue = f.flag("overdue");
  const stuck = f.flag("stuck");
  const mine = f.flag("mine");
  const hot = f.flag("hot");

  // Count only the structured filters that live inside the popover (so the badge matches what's hidden).
  const popoverCount =
    (track ? 1 : 0) +
    (clientId ? 1 : 0) +
    (status ? 1 : 0) +
    (licenseStatus ? 1 : 0) +
    f.tags.length;

  const hasFilters = Boolean(
    popoverCount || f.get("search") || overdue || stuck || mine || hot || sort !== "newest",
  );

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
      <FilterChip pressed={hot} onToggle={() => f.toggleFlag("hot", !hot)}>
        Hot
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
          label="Status"
          value={status}
          onChange={(e) => f.setParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {ALL_STATUS_CODES.map((code) => (
            <option key={code} value={code}>
              {statusLabel(code)}
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
