"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CandidateListDTO, CandidateListItemDTO } from "@/lib/validation/candidate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Table, Td } from "@/components/ui/table";
import { fetchListPage } from "./lib/list-fetch";
import { filterHotLocal, mergePage, sortByFitLocal } from "./lib/list-pagination";

/**
 * Client wrapper for the `/candidates` browse table. The RSC SSR-renders page 1 and hands it in as
 * `initial`; this component accumulates further keyset pages via a "Load more" button (carrying the
 * current URL filters + sort), shows the honest "Showing N of {total}", and applies the two
 * PAGE-LOCAL toggles — "Sort by fit (this page)" (reorder loaded rows) and "Hot (this page)" (score
 * ≥ HOT_SCORE over loaded rows). Neither page-local toggle hits the server. It is REMOUNTED (keyed on
 * the server-filter signature by the RSC) whenever a server filter/sort changes, so `initial` is
 * always page 1 for the current query.
 */
export function CandidatesList({ initial }: { initial: CandidateListDTO }) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<CandidateListItemDTO[]>(initial.candidates);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [fitSort, setFitSort] = useState(false);
  const [hotOnly, setHotOnly] = useState(false);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchListPage(searchParams, nextCursor);
      const merged = mergePage(rows, page.candidates);
      const added = merged.length - rows.length;
      setRows(merged);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setAnnouncement(`Loaded ${added} more. Showing ${merged.length} of ${initial.total}.`);
    } catch {
      setError("Couldn't load more candidates. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Page-local view: filter (hot) then reorder (fit) the already-loaded rows. Never a re-query.
  let visible = rows;
  if (hotOnly) visible = filterHotLocal(visible);
  if (fitSort) visible = sortByFitLocal(visible);

  return (
    <div className="flex flex-col gap-3">
      {/* Page-local toggles — clearly scoped to the loaded rows. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={hotOnly ? "primary" : "secondary"}
          aria-pressed={hotOnly}
          onClick={() => setHotOnly((v) => !v)}
          className="rounded-full"
        >
          Hot (this page)
        </Button>
        <Button
          type="button"
          size="sm"
          variant={fitSort ? "primary" : "secondary"}
          aria-pressed={fitSort}
          onClick={() => setFitSort((v) => !v)}
          className="rounded-full"
        >
          Sort by fit (this page)
        </Button>
        <span className="ml-auto text-xs text-gray">
          Showing {rows.length} of {initial.total}
          {hotOnly ? ` · ${visible.length} hot (this page)` : ""}
        </span>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={hotOnly ? "No hot candidates on this page" : "No candidates match"}
          description={
            hotOnly
              ? "Turn off the Hot filter or load more rows to see other candidates."
              : "Try clearing or widening the filters, or add a new candidate."
          }
        />
      ) : (
        <Table
          caption="Candidates"
          columns={[
            "Name",
            "Credential",
            "Track",
            "Client",
            "Score",
            "Status",
            "License",
            "Days in stage",
          ]}
        >
          {visible.map((c) => (
            <tr key={c.id} className="transition hover:bg-black/[0.03]">
              <Td>
                <Link
                  href={`/candidates/${c.id}`}
                  className="font-semibold text-navy hover:underline focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
                >
                  {c.name}
                </Link>
              </Td>
              <Td>{c.credential ?? <span className="text-gray">—</span>}</Td>
              <Td>
                <Badge tone="neutral">{c.track}</Badge>
              </Td>
              <Td>{c.clientName ?? <span className="text-gray italic">Unassigned</span>}</Td>
              <Td>
                <ScoreBadge score={c.score} />
              </Td>
              <Td>{c.statusLabel}</Td>
              <Td>
                <Badge tone={c.licenseStatus === "Active" ? "success" : "neutral"}>
                  {c.licenseStatus}
                </Badge>
              </Td>
              <Td>{c.daysInStage}d</Td>
            </tr>
          ))}
        </Table>
      )}

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
      ) : rows.length > 0 ? (
        <p className="pt-1 text-center text-xs text-gray">End of results.</p>
      ) : null}
    </div>
  );
}
