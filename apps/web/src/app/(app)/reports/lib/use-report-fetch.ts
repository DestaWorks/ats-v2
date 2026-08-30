"use client";

import { useEffect, useRef, useState } from "react";
import { getJson, type ApiFailure } from "@/lib/api/client";

export interface ReportFilterState {
  clientId: string;
  createdById: string;
  source: string;
  credential: string;
  addedFrom: string; // "YYYY-MM-DD" or ""
  addedTo: string;
}

export const EMPTY_FILTERS: ReportFilterState = {
  clientId: "",
  createdById: "",
  source: "",
  credential: "",
  addedFrom: "",
  addedTo: "",
};

/** Query string for a `ReportFilterState` — shared by every filtered `/api/reports/*` call. */
export function buildReportQuery(f: ReportFilterState): string {
  const p = new URLSearchParams();
  if (f.clientId) p.set("clientId", f.clientId);
  if (f.createdById) p.set("createdById", f.createdById);
  if (f.source) p.set("source", f.source);
  if (f.credential) p.set("credential", f.credential);
  if (f.addedFrom) p.set("addedFrom", f.addedFrom);
  if (f.addedTo) p.set("addedTo", f.addedTo);
  return p.toString();
}

/**
 * Fetch one report endpoint, refetching whenever `query` changes. Every report tab is a thin
 * wrapper around this — the tab mounts only when selected (`DetailTabs` renders just the active
 * panel), so this naturally fetches lazily and refetches on tab switch, which is fine for
 * read-only report GETs.
 *
 * `initialData` (perf audit 2026-08-05): when the page already server-fetched this exact
 * `path`+`query` (currently only the Executive tab's default/unfiltered load, seeded in
 * `reports/page.tsx`), pass it here to skip the redundant client fetch on first mount — the
 * effect below still fires on every later `query` change (filters applied), same as before.
 */
export function useReportFetch<T>(
  path: string,
  query: string,
  initialData?: T,
): T | ApiFailure | undefined {
  const [data, setData] = useState<T | ApiFailure | undefined>(initialData);
  const skipNextFetch = useRef(initialData !== undefined);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    let cancelled = false;
    setData(undefined);
    void getJson<T>(`${path}?${query}`).then((res) => {
      if (!cancelled) setData(res.ok ? res.data : res.failure);
    });
    return () => {
      cancelled = true;
    };
  }, [path, query]);

  return data;
}
