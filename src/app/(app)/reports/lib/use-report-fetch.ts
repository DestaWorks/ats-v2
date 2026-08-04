"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api/client";

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
 */
export function useReportFetch<T>(path: string, query: string): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    void getJson<T>(`${path}?${query}`).then((res) => {
      if (!cancelled) setData(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [path, query]);

  return data;
}
