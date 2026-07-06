import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Shared URL-param filter mechanics for the browse toolbars (candidates list + pipeline board).
 * Provides typed reads (`get`/`flag`/`tags`), setters that `router.replace` the URL (the RSC/board
 * re-reads), tag toggling, a "clear everything" reset, and a debounced free-text search mirrored into
 * `?search`. `resetPage` also clears `?page` on every change — the offset list wants page 1 on any
 * filter change; the keyset board has no page param, so it opts out (the default).
 */
export function useUrlFilters({ resetPage = false }: { resetPage?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = (key: string) => searchParams.get(key) ?? "";
  const flag = (key: string) => searchParams.get(key) === "1";
  const tags = (searchParams.get("tags") ?? "").split(",").filter(Boolean);

  const urlSearch = get("search");
  const [search, setSearch] = useState(urlSearch);
  const firstRun = useRef(true);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (resetPage) params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleFlag(key: string, on: boolean) {
    setParam(key, on ? "1" : "");
  }

  function toggleTag(tag: string) {
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setParam("tags", next.join(","));
  }

  function clearAll() {
    setSearch("");
    router.replace(pathname, { scroll: false });
  }

  // Keep the input in sync when the URL is changed elsewhere (e.g. Clear).
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

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

  return {
    searchParams,
    get,
    flag,
    tags,
    setParam,
    toggleFlag,
    toggleTag,
    clearAll,
    search,
    setSearch,
  };
}
