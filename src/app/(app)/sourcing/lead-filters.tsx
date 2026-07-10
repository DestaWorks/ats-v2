"use client";

import { LEAD_STATUSES, SOURCES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FilterChip } from "../lib/filter-chip";
import { useUrlFilters } from "../lib/use-url-filters";

/**
 * The `/sourcing` filter card (legacy parity): one row — search + INLINE All-Statuses /
 * All-Sources / All-Clients / All-Owners dropdowns (no popover) + the "Show deleted" chip. All
 * state lives in the URL `searchParams` (shareable); each change `router.replace`s the URL, the
 * RSC re-reads page 1 of the (keyset) list, and the list is remounted (keyed on the filter
 * signature) so it re-seeds. Free-text search is debounced (~300ms). Client component — the
 * option lists come in as props (no `src/server/**` imports).
 */
export function LeadFilters({
  clients,
  owners,
}: {
  clients: { id: string; name: string }[];
  owners: { id: string; name: string }[];
}) {
  const f = useUrlFilters();

  const status = f.get("status");
  const source = f.get("source");
  const clientId = f.get("clientId");
  const ownerId = f.get("ownerId");
  const showDeleted = f.flag("deleted");
  const hasFilters = Boolean(
    status || source || clientId || ownerId || f.get("search") || showDeleted,
  );

  const inline = (
    label: string,
    key: string,
    value: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="w-40 shrink-0">
      <Select aria-label={label} value={value} onChange={(e) => f.setParam(key, e.target.value)}>
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-white p-3">
      <div className="min-w-56 flex-1">
        <input
          type="search"
          value={f.search}
          onChange={(e) => f.setSearch(e.target.value)}
          placeholder="Search name or email…"
          aria-label="Search leads"
          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
        />
      </div>
      {inline(
        "All Statuses",
        "status",
        status,
        LEAD_STATUSES.map((s) => ({ value: s, label: s })),
      )}
      {inline(
        "All Sources",
        "source",
        source,
        SOURCES.map((s) => ({ value: s, label: s })),
      )}
      {inline(
        "All Clients",
        "clientId",
        clientId,
        clients.map((c) => ({ value: c.id, label: c.name })),
      )}
      {inline(
        "All Owners",
        "ownerId",
        ownerId,
        owners.map((o) => ({ value: o.id, label: o.name })),
      )}
      {/* Include soft-deleted leads — they render flagged, each with a Restore action. */}
      <FilterChip pressed={showDeleted} onToggle={() => f.toggleFlag("deleted", !showDeleted)}>
        Show deleted
      </FilterChip>
      {hasFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={f.clearAll}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
