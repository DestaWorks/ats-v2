"use client";

import type { RolePriority, RoleStatus } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterField, FilterToolbar, FiltersPopover } from "../lib/filter-toolbar";
import { useUrlFilters } from "../lib/use-url-filters";

/**
 * Compact toolbar for the `/roles` browse list — matches `candidates/list-filters.tsx` exactly
 * (search box · quick chips · a "Filters" popover with an active-count badge), built on the same
 * shared `FilterToolbar`/`useUrlFilters` primitives, rather than a bespoke filter card. State
 * lives in the URL (shareable); `resetPage: true` since `/roles` is offset-paginated.
 */
export function RoleFilters({
  clients,
  statuses,
  priorities,
}: {
  clients: { id: string; name: string }[];
  statuses: readonly RoleStatus[];
  priorities: readonly RolePriority[];
}) {
  const f = useUrlFilters({ resetPage: true });

  const clientId = f.get("clientId");
  const status = f.get("status");
  const priority = f.get("priority");

  const popoverCount = (clientId ? 1 : 0) + (status ? 1 : 0) + (priority ? 1 : 0);
  const hasFilters = Boolean(popoverCount || f.get("search"));

  return (
    <FilterToolbar
      search={f.search}
      onSearchChange={f.setSearch}
      placeholder="Search title…"
      searchLabel="Search roles"
    >
      <FiltersPopover count={popoverCount}>
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
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterField>

        <FilterField
          label="Priority"
          value={priority}
          onChange={(e) => f.setParam("priority", e.target.value)}
        >
          <option value="">All priorities</option>
          {priorities.map((p) => (
            <option key={p} value={p}>
              {p}
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
