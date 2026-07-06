"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LEAD_STATUSES, SOURCES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Status / source / search filters for the `/sourcing` inventory, all reflected in the URL
 * `searchParams` (shareable) — mirrors the `/candidates` `ListFilters` pattern. Each change
 * `router.replace`s the URL; the RSC reads those params and re-reads page 1 of the (keyset) list, and
 * the list is remounted (keyed on the filter signature) so it re-seeds. Status + source are
 * dropdowns (the server matches source on exact equality); free-text search is debounced (~300ms) so
 * typing doesn't thrash the URL. Client component — imports no `src/server/**`.
 */
export function LeadFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "";
  const source = searchParams.get("source") ?? "";
  const urlSearch = searchParams.get("search") ?? "";

  const [search, setSearch] = useState(urlSearch);
  const firstRun = useRef(true);

  // Keep the input in sync when the URL changes elsewhere (e.g. Clear).
  useEffect(() => setSearch(urlSearch), [urlSearch]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Debounce the free-text search into the URL.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const handle = setTimeout(() => {
      if (search.trim() !== urlSearch) setParam("search", search.trim());
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(status || source || urlSearch);

  function clearAll() {
    setSearch("");
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
        Status
        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
        Source
        <select
          value={source}
          onChange={(e) => setParam("source", e.target.value)}
          className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
        Search
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or email…"
          className="w-56 rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm"
        />
      </label>

      {hasFilters ? (
        <Button type="button" variant="secondary" size="sm" onClick={clearAll}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
