"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LICENSE_STATUSES, TAGS, TRACKS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FilterChip } from "../lib/filter-chip";

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Track / client / license / tags / text-search filters + server-backed quick-filter chips, all
 * reflected in the URL `searchParams` (shareable). Each change `router.replace`s the URL; the board
 * reads those params and re-fetches. Search is debounced (~300ms). The chips (Overdue · Stuck · My
 * candidates) are DB-backed; the page-local Hot lens lives on the board itself.
 */
export function BoardFilters({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const track = searchParams.get("track") ?? "";
  const clientId = searchParams.get("clientId") ?? "";
  const licenseStatus = searchParams.get("licenseStatus") ?? "";
  const urlSearch = searchParams.get("search") ?? "";
  const activeTags = (searchParams.get("tags") ?? "").split(",").filter(Boolean);
  const mine = searchParams.get("mine") === "1";
  const overdue = searchParams.get("overdue") === "1";
  const stuck = searchParams.get("stuck") === "1";

  const [search, setSearch] = useState(urlSearch);
  const firstRun = useRef(true);

  // Keep the input in sync when the URL is changed elsewhere (e.g. Clear).
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleFlag(key: string, on: boolean) {
    setParam(key, on ? "1" : "");
  }

  function toggleTag(tag: string) {
    const next = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    setParam("tags", next.join(","));
  }

  // Debounce the free-text search into the URL.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const handle = setTimeout(() => {
      if (search !== urlSearch) setParam("search", search.trim());
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(
    track ||
    clientId ||
    licenseStatus ||
    urlSearch ||
    activeTags.length ||
    mine ||
    overdue ||
    stuck,
  );

  function clearAll() {
    setSearch("");
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
          Track
          <select
            value={track}
            onChange={(e) => setParam("track", e.target.value)}
            className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All tracks</option>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
          Client
          <select
            value={clientId}
            onChange={(e) => setParam("clientId", e.target.value)}
            className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-charcoal">
          License
          <select
            value={licenseStatus}
            onChange={(e) => setParam("licenseStatus", e.target.value)}
            className="rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All licenses</option>
            {LICENSE_STATUSES.map((ls) => (
              <option key={ls} value={ls}>
                {ls}
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

      {/* Server-backed quick-filter chips. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip pressed={overdue} onToggle={() => toggleFlag("overdue", !overdue)}>
          Overdue
        </FilterChip>
        <FilterChip pressed={stuck} onToggle={() => toggleFlag("stuck", !stuck)}>
          Stuck
        </FilterChip>
        <FilterChip pressed={mine} onToggle={() => toggleFlag("mine", !mine)}>
          My candidates
        </FilterChip>
      </div>

      {/* Any-of tag filter. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-charcoal">Tags</span>
        {TAGS.map((tag) => (
          <FilterChip key={tag} pressed={activeTags.includes(tag)} onToggle={() => toggleTag(tag)}>
            {tag}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
