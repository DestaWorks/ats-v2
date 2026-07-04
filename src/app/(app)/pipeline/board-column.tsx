"use client";

import { useDroppable } from "@dnd-kit/core";
import { statusSlaDays, type CandidateStatus } from "@/lib/constants";
import type { BoardColumn as BoardColumnData, CandidateCardDTO } from "@/lib/validation/pipeline";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { CandidateCard } from "./candidate-card";
import { STATUS_BG } from "./lib/status-style";

export function BoardColumn({
  column,
  onMove,
  busy,
  isDragActive,
}: {
  column: BoardColumnData;
  onMove: (card: CandidateCardDTO, toStatus: CandidateStatus) => void;
  busy?: boolean;
  isDragActive?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const sla = statusSlaDays(column.status);

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

      {sla != null ? (
        <p className="px-3 pt-1.5 text-[10px] text-gray">SLA {sla}d</p>
      ) : (
        <p className="px-3 pt-1.5 text-[10px] text-transparent select-none">.</p>
      )}

      <ul className="flex min-h-24 flex-1 flex-col gap-2 p-3 pt-2">
        {column.candidates.length === 0 ? (
          <li className="rounded-lg border border-dashed border-black/10 px-3 py-6 text-center text-xs text-gray">
            Empty
          </li>
        ) : (
          column.candidates.map((card) => (
            <CandidateCard key={card.id} card={card} onMove={onMove} busy={busy} />
          ))
        )}
      </ul>

      {/* The board caps cards per column; when the true total exceeds what shipped, say so. */}
      {column.count > column.candidates.length ? (
        <p className="border-t border-black/5 px-3 py-2 text-center text-[10px] text-gray">
          Showing {column.candidates.length} of {column.count}
        </p>
      ) : null}
    </section>
  );
}
