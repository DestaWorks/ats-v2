"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { auditActionLabel, auditActionTone, auditEntityLabel } from "@/lib/constants";
import type {
  ActivityDetailDTO,
  ActivityItemDTO,
  ActivityListDTO,
} from "@/lib/validation/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Table, Td } from "@/components/ui/table";
import { fetchActivityDetail, fetchActivityPage } from "./lib/activity-fetch";
import { diffChangedKeys, formatActivityValue } from "./lib/activity-query";

/**
 * Client wrapper for the `/activity` (Activity Log) table. The RSC SSR-renders page 1 as `initial`;
 * this component accumulates further keyset pages via "Load more" (carrying the current URL filters),
 * dedupes by id, and announces the new count (`aria-live`). Each row with changes has a real
 * `<button>` expander (`aria-expanded`/`aria-controls`) that lazily `fetch`es the on-demand
 * `before`/`after` detail (cached per row so re-expanding never refetches) and renders it as a safe
 * changed-keys diff (AL-7) — plain, escaped text; NEVER `dangerouslySetInnerHTML`. Remounted by the
 * RSC (keyed on the filter signature) whenever a server filter changes, so `initial` is always page 1.
 */

/** A tiny relative-time label ("3h ago") for the `title` hover on the absolute timestamp. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

interface DetailState {
  loading: boolean;
  data?: ActivityDetailDTO;
  error?: string;
}

const COLUMNS = ["When", "Who", "Action", "Entity", "Changes"];

export function ActivityLog({ initial }: { initial: ActivityListDTO }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ActivityItemDTO[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Per-row detail cache — a fetched row is never refetched (re-expand reuses the cache).
  const [details, setDetails] = useState<Record<string, DetailState>>({});

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchActivityPage(searchParams, nextCursor);
      const seen = new Set(rows.map((r) => r.id));
      const added = page.items.filter((r) => !seen.has(r.id));
      const merged = [...rows, ...added];
      setRows(merged);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setAnnouncement(`Loaded ${added.length} more. Showing ${merged.length} entries.`);
    } catch {
      setError("Couldn't load more activity. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetails((d) => ({ ...d, [id]: { loading: true } }));
    try {
      const data = await fetchActivityDetail(id);
      setDetails((d) => ({ ...d, [id]: { loading: false, data } }));
    } catch {
      setDetails((d) => ({ ...d, [id]: { loading: false, error: "Couldn't load the changes." } }));
    }
  }

  function toggleExpand(row: ActivityItemDTO) {
    const isOpen = expanded.has(row.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    // Fetch on first open only (cache hit or in-flight → skip).
    if (!isOpen && !details[row.id]) void loadDetail(row.id);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No activity matches"
        description="Try clearing or widening the filters, or pick a different date range."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <span className="ml-auto text-xs text-gray">Showing {rows.length} entries</span>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <Table caption="Activity log" columns={COLUMNS}>
        {rows.map((row) => {
          const isOpen = expanded.has(row.id);
          const panelId = `activity-detail-${row.id}`;
          const detail = details[row.id];
          return (
            <RowGroup
              key={row.id}
              row={row}
              isOpen={isOpen}
              panelId={panelId}
              detail={detail}
              onToggle={() => toggleExpand(row)}
              onRetry={() => void loadDetail(row.id)}
            />
          );
        })}
      </Table>

      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={loadMore} loading={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : (
        <p className="pt-1 text-center text-xs text-gray">End of results.</p>
      )}
    </div>
  );
}

function RowGroup({
  row,
  isOpen,
  panelId,
  detail,
  onToggle,
  onRetry,
}: {
  row: ActivityItemDTO;
  isOpen: boolean;
  panelId: string;
  detail: DetailState | undefined;
  onToggle: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      <tr className="transition hover:bg-black/[0.03]">
        <Td>
          <time dateTime={row.at} title={relativeTime(row.at)} className="whitespace-nowrap">
            {formatWhen(row.at)}
          </time>
        </Td>
        <Td>{row.actorName}</Td>
        <Td>
          <Badge tone={auditActionTone(row.action)}>{auditActionLabel(row.action)}</Badge>
        </Td>
        <Td>
          <EntityCell row={row} />
        </Td>
        <Td>
          {row.hasChanges ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="text-sm font-medium text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            >
              {isOpen ? "Hide changes" : "Show changes"}
            </button>
          ) : (
            <span className="text-gray">—</span>
          )}
        </Td>
      </tr>
      {isOpen ? (
        <tr>
          <td colSpan={COLUMNS.length} className="bg-black/[0.02] px-3 py-3">
            <div id={panelId}>
              <ChangesPanel detail={detail} onRetry={onRetry} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EntityCell({ row }: { row: ActivityItemDTO }) {
  const label = row.entityLabel ?? row.entityId;
  const kind = auditEntityLabel(row.entity);
  if (row.entityLink) {
    return (
      <Link
        href={row.entityLink}
        className="font-medium text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
      >
        {label}
        <span className="ml-1 text-xs text-gray">{kind}</span>
      </Link>
    );
  }
  return (
    <span>
      {row.entityLabel ? (
        <span className="text-charcoal">{label}</span>
      ) : (
        <span className="font-mono text-xs text-gray" title={row.entityId}>
          {label}
        </span>
      )}
      <span className="ml-1 text-xs text-gray">{kind}</span>
    </span>
  );
}

function ChangesPanel({
  detail,
  onRetry,
}: {
  detail: DetailState | undefined;
  onRetry: () => void;
}) {
  if (!detail || detail.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray">
        <Spinner className="h-4 w-4" label="Loading changes" />
        Loading changes…
      </div>
    );
  }
  if (detail.error) {
    return (
      <div className="flex items-center gap-3 text-sm text-red" role="alert">
        {detail.error}
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const changes = diffChangedKeys(detail.data?.before ?? null, detail.data?.after ?? null);
  if (changes.length === 0) {
    return <p className="text-sm text-gray">No field-level changes recorded.</p>;
  }

  return (
    <Table caption="Changed fields" columns={["Field", "Before", "After"]} className="text-xs">
      {changes.map((change) => (
        <tr key={change.key}>
          <Td className="font-medium text-charcoal">{change.key}</Td>
          <Td className="break-words whitespace-pre-wrap text-gray">
            {formatActivityValue(change.before)}
          </Td>
          <Td className="break-words whitespace-pre-wrap text-charcoal">
            {formatActivityValue(change.after)}
          </Td>
        </tr>
      ))}
    </Table>
  );
}
