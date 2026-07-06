"use client";

import { ALL_STATUS_CODES, LICENSE_STATUSES, SOURCES, TRACKS, statusLabel } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterChip } from "../lib/filter-chip";
import { FilterField, FilterToolbar, FiltersPopover, TagFilter } from "../lib/filter-toolbar";
import { useUrlFilters } from "../lib/use-url-filters";

export interface ClientOption {
  id: string;
  name: string;
}

export interface OwnerOption {
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
export function ListFilters({
  clients,
  owners,
}: {
  clients: ClientOption[];
  owners: OwnerOption[];
}) {
  const f = useUrlFilters({ resetPage: true });

  const track = f.get("track");
  const clientId = f.get("clientId");
  const status = f.get("status");
  const licenseStatus = f.get("licenseStatus");
  const source = f.get("source");
  const ownerId = f.get("ownerId");
  const addedFrom = f.get("addedFrom");
  const addedTo = f.get("addedTo");
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
    (source ? 1 : 0) +
    (ownerId ? 1 : 0) +
    (addedFrom || addedTo ? 1 : 0) +
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

        <FilterField
          label="Added by"
          value={ownerId}
          onChange={(e) => f.setParam("ownerId", e.target.value)}
        >
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </FilterField>

        {/* Added-date range — server treats each bound as an inclusive UTC day. */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
            Added from
            <input
              type="date"
              value={addedFrom}
              onChange={(e) => f.setParam("addedFrom", e.target.value)}
              className="w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
            Added to
            <input
              type="date"
              value={addedTo}
              onChange={(e) => f.setParam("addedTo", e.target.value)}
              className="w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </label>
        </div>

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
