"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TRACKS } from "@/lib/constants";

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Track / client / text-search filters, reflected in the URL `searchParams` (shareable). Each
 * change `router.replace`s the URL; the board reads those params and re-fetches. Search is
 * debounced (~300ms) into the `search` param.
 */
export function BoardFilters({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const track = searchParams.get("track") ?? "";
  const clientId = searchParams.get("clientId") ?? "";
  const urlSearch = searchParams.get("search") ?? "";

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

  const hasFilters = Boolean(track || clientId || urlSearch);

  function clearAll() {
    setSearch("");
    router.replace(pathname, { scroll: false });
  }

  return (
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
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold text-charcoal transition hover:bg-black/5"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
