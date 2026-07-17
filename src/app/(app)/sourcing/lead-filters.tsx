"use client";

import { LEAD_STATUSES, SOURCES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterField, FilterToolbar, FiltersPopover } from "../lib/filter-toolbar";
import { useUrlFilters } from "../lib/use-url-filters";

/**
 * Compact toolbar for the `/sourcing` browse list — matches `candidates/list-filters.tsx` and
 * `roles/role-filters.tsx` (search box · a "Filters" popover with an active-count badge), built
 * on the same shared `FilterToolbar`/`useUrlFilters` primitives rather than a bespoke filter
 * card. State lives in the URL `searchParams` (shareable); each change `router.replace`s the URL
 * and the RSC re-reads page 1 (offset-paginated — `resetPage: true`).
 *
 * No "Show deleted" chip — removed from the UI by request (soft-deleted leads aren't a workflow
 * this list surfaces). `showDeleted`/`?deleted=` is kept as a `hasFilters`/`Clear` input only so
 * a stale/bookmarked `?deleted=true` URL still shows a way to reset it; nothing in the UI can
 * turn it on anymore.
 */
export function LeadFilters({
  clients,
  owners,
}: {
  clients: { id: string; name: string }[];
  owners: { id: string; name: string }[];
}) {
  const f = useUrlFilters({ resetPage: true });

  const status = f.get("status");
  const source = f.get("source");
  const clientId = f.get("clientId");
  const ownerId = f.get("ownerId");
  const showDeleted = f.flag("deleted");

  const popoverCount = (status ? 1 : 0) + (source ? 1 : 0) + (clientId ? 1 : 0) + (ownerId ? 1 : 0);
  const hasFilters = Boolean(popoverCount || f.get("search") || showDeleted);

  return (
    <FilterToolbar
      search={f.search}
      onSearchChange={f.setSearch}
      placeholder="Search name or email…"
      searchLabel="Search leads"
    >
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
          label="Owner"
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
      </FiltersPopover>

      {hasFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={f.clearAll}>
          Clear
        </Button>
      ) : null}
    </FilterToolbar>
  );
}
