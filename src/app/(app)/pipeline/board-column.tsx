"use client";

import { useDroppable } from "@dnd-kit/core";
import { statusSlaDays, type CandidateStatus } from "@/lib/constants";
import type { BoardColumn as BoardColumnData, CandidateCardDTO } from "@/lib/validation/pipeline";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filterHotLocal } from "../lib/list-local";
import { CandidateCard } from "./candidate-card";
import { STATUS_BG } from "./lib/status-style";

export function BoardColumn({
  column,
  onMove,
  busy,
  isDragActive,
  hotOnly = false,
  onLoadMore,
  loadingMore = false,
}: {
  column: BoardColumnData;
  onMove: (card: CandidateCardDTO, toStatus: CandidateStatus) => void;
  busy?: boolean;
  isDragActive?: boolean;
  /** Page-local "Hot" lens — filters only the RENDERED cards (footer counts stay honest). */
  hotOnly?: boolean;
  /** Load the next per-column keyset page (present only when this column `hasMore`). */
  onLoadMore?: (status: CandidateStatus) => void;
  loadingMore?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const sla = statusSlaDays(column.status);
  const loaded = column.candidates.length;
  const cards = hotOnly ? filterHotLocal(column.candidates) : column.candidates;
  const remaining = Math.max(0, column.count - loaded);
  // Avg days-in-stage over the LOADED cards (legacy column footer stat, honest about its basis).
  const avgDays =
    loaded > 0
      ? Math.round(column.candidates.reduce((sum, c) => sum + c.daysInStage, 0) / loaded)
      : null;

  return (
    <section
      ref={setNodeRef}
      role="group"
      aria-label={`${column.label} — ${column.count} candidates`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-surface/60 transition-colors",
        isOver ? "border-navy/40 bg-navy/5" : "border-black/5",
        isDragActive && !isOver && "border-dashed",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-black/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", STATUS_BG[column.status])} />
          <h2 className="text-xs font-bold tracking-wide text-charcoal uppercase">
            {column.label}
          </h2>
        </div>
        <Badge>{column.count}</Badge>
      </header>

      {sla != null || avgDays != null ? (
        <p className="px-3 pt-1.5 text-[10px] text-gray">
          {[sla != null ? `SLA ${sla}d` : null, avgDays != null ? `avg ${avgDays}d in stage` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : (
        <p className="px-3 pt-1.5 text-[10px] text-transparent select-none">.</p>
      )}

      <ul className="flex min-h-24 flex-1 flex-col gap-2 p-3 pt-2">
        {cards.length === 0 ? (
          <li className="rounded-lg border border-dashed border-black/10 px-3 py-6 text-center text-xs text-gray">
            {hotOnly && loaded > 0 ? "No hot candidates on this page" : "Empty"}
          </li>
        ) : (
          cards.map((card) => (
            <CandidateCard key={card.id} card={card} onMove={onMove} busy={busy} />
          ))
        )}
      </ul>

      {/* Per-column pagination footer: honest "N of M" (loaded of true total) + a keyset Load more. */}
      {remaining > 0 ? (
        <div className="flex flex-col items-center gap-1.5 border-t border-black/5 px-3 py-2">
          <p className="text-[10px] text-gray">
            Showing {loaded} of {column.count}
          </p>
          {column.hasMore && onLoadMore ? (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              loading={loadingMore}
              onClick={() => onLoadMore(column.status)}
              className="w-full"
            >
              {loadingMore ? "Loading…" : `Load ${remaining} more`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
