"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { statusLabel, type CandidateStatus } from "@/lib/constants";
import type { BoardResponse, CandidateCardDTO } from "@/lib/validation/pipeline";
import type { SavedViewDTO } from "@/lib/validation/saved-view";
import { Spinner } from "@/components/ui/spinner";
import { mergePage } from "../lib/list-local";
import { SavedViewsBar } from "../lib/saved-views-bar";
import { BoardColumn } from "./board-column";
import { BoardFilters, type ClientOption } from "./board-filters";
import { CandidateCardContent, CandidateCardFooterPreview } from "./candidate-card";
import { TerminalRail } from "./terminal-rail";
import { applyBoardMove } from "./lib/optimistic-move";
import { fetchBoard, fetchColumnPage, postMove } from "./lib/board-fetch";

function findCard(board: BoardResponse, id: string): CandidateCardDTO | null {
  for (const col of board.columns) {
    const found = col.candidates.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}

export function PipelineBoard({
  initial,
  clients,
  owners,
  savedViews,
}: {
  initial: BoardResponse;
  clients: ClientOption[];
  owners: { id: string; name: string }[];
  savedViews: SavedViewDTO[];
}) {
  const searchParams = useSearchParams();
  const [board, setBoard] = useState(initial);
  const [optimisticBoard, addOptimistic] = useOptimistic(
    board,
    (state, action: { id: string; toStatus: CandidateStatus }) =>
      applyBoardMove(state, action.id, action.toStatus),
  );
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [activeCard, setActiveCard] = useState<CandidateCardDTO | null>(null);
  const includeTerminal = useRef(false);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [hotOnly, setHotOnly] = useState(false);
  // Page-local "Hide empty stages" (legacy pHideEmpty) — collapses 0-count columns so live stages
  // get the width. A column stays visible if an optimistic move just landed a card in it.
  const [hideEmpty, setHideEmpty] = useState(false);
  const [loadingColumn, setLoadingColumn] = useState<Record<string, boolean>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Re-fetch the board when the URL filters change (client re-fetch keeps the client the source of
  // board state so it plays cleanly with in-flight optimistic moves). Skips the initial run — the
  // RSC already provided `initial` for the current URL.
  const didMount = useRef(false);
  const paramsKey = searchParams.toString();
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    let cancelled = false;
    setPending(true);
    const params = new URLSearchParams(paramsKey);
    if (includeTerminal.current) params.set("includeTerminal", "1");
    fetchBoard(params)
      .then((next) => {
        if (!cancelled) {
          setBoard(next);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the board for those filters. Try again.");
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paramsKey]);

  function announce(message: string) {
    setAnnouncement(message);
  }

  function onMove(card: CandidateCardDTO, toStatus: CandidateStatus) {
    if (card.status === toStatus) return;
    startTransition(async () => {
      addOptimistic({ id: card.id, toStatus });
      const result = await postMove(card.id, toStatus);
      const label = statusLabel(toStatus);
      if (result.ok) {
        // Commit to base — the optimistic view already shows this, so no visible snap-back.
        setBoard((prev) => applyBoardMove(prev, card.id, toStatus));
        toast.success(`${card.name} moved to ${label}`);
        announce(`${card.name} moved to ${label}`);
      } else if (result.failure.code === "STAGE_BLOCKED") {
        const reasons = result.failure.reasons;
        toast.error(`Can't move ${card.name} to ${label}`, {
          description: reasons.join(" · ") || result.failure.message,
        });
        announce(`Move blocked: ${reasons.join("; ") || result.failure.message}`);
        // Base unchanged → useOptimistic reverts the card to its original column.
      } else {
        toast.error(`Couldn't move ${card.name}. Please try again.`);
        announce(`Move failed for ${card.name}`);
      }
    });
  }

  function onExpandTerminal() {
    includeTerminal.current = true;
    setTerminalLoading(true);
    const params = new URLSearchParams(paramsKey);
    params.set("includeTerminal", "1");
    fetchBoard(params)
      .then((next) => setBoard(next))
      .catch(() => toast.error("Couldn't load terminal candidates."))
      .finally(() => setTerminalLoading(false));
  }

  // Per-column "Load more" — fetch the next keyset page for one column and append (deduped) to its
  // cards, advancing that column's cursor. Reads the cursor from BASE `board` (drag moves never touch
  // it) and commits via `setBoard`, so `useOptimistic` re-derives cleanly and in-flight moves survive.
  function onLoadMoreColumn(status: CandidateStatus) {
    const col = board.columns.find((c) => c.status === status);
    if (!col?.nextCursor || loadingColumn[status]) return;
    setLoadingColumn((prev) => ({ ...prev, [status]: true }));
    const params = new URLSearchParams(paramsKey);
    fetchColumnPage(params, status, col.nextCursor)
      .then((page) => {
        setBoard((prev) => ({
          ...prev,
          columns: prev.columns.map((c) =>
            c.status === status
              ? {
                  ...c,
                  candidates: mergePage(c.candidates, page.items),
                  nextCursor: page.nextCursor,
                  hasMore: page.hasMore,
                }
              : c,
          ),
        }));
        announce(`Loaded ${page.items.length} more in ${statusLabel(status)}.`);
      })
      .catch(() => toast.error("Couldn't load more candidates."))
      .finally(() => setLoadingColumn((prev) => ({ ...prev, [status]: false })));
  }

  function onDragStart(e: DragStartEvent) {
    setActiveCard(findCard(optimisticBoard, String(e.active.id)));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = e;
    if (!over) return;
    const card = findCard(optimisticBoard, String(active.id));
    if (!card) return;
    const toStatus = String(over.id) as CandidateStatus;
    if (card.status === toStatus) return;
    onMove(card, toStatus);
  }

  return (
    <div className="flex flex-col gap-4">
      <BoardFilters
        clients={clients}
        owners={owners}
        hotOnly={hotOnly}
        onToggleHot={() => setHotOnly((v) => !v)}
      />
      <SavedViewsBar scope="pipeline" initial={savedViews} />

      {/* Legacy placement: its own row between the filters and the columns, left-aligned. */}
      <label className="-mb-1 flex w-fit cursor-pointer items-center gap-2 text-sm text-gray select-none">
        <input
          type="checkbox"
          checked={hideEmpty}
          onChange={() => setHideEmpty((v) => !v)}
          className="h-4 w-4 accent-navy"
        />
        Hide empty stages
      </label>

      {error ? (
        <p role="alert" className="rounded-md bg-red/5 px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}

      {/* Live region — announces the async move outcome (dnd-kit covers pickup/drop). */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveCard(null)}
      >
        <div className="relative flex gap-4 overflow-x-auto pb-4" aria-busy={pending}>
          {pending ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/40 pt-10">
              <Spinner className="h-6 w-6" />
            </div>
          ) : null}

          {optimisticBoard.columns
            // Hide-empty: keep a column if it has a TRUE count or an optimistically-landed card
            // (so a drag target never vanishes mid-flight). You can't drag INTO a hidden column —
            // same trade-off as the legacy toggle; the per-card select still reaches every stage.
            .filter((c) => !hideEmpty || c.count > 0 || c.candidates.length > 0)
            .map((column) => (
              <BoardColumn
                key={column.status}
                column={column}
                onMove={onMove}
                busy={pending}
                isDragActive={activeCard !== null}
                hotOnly={hotOnly}
                onLoadMore={onLoadMoreColumn}
                loadingMore={loadingColumn[column.status] ?? false}
              />
            ))}

          <TerminalRail
            terminal={optimisticBoard.terminal}
            onExpand={onExpandTerminal}
            loading={terminalLoading}
          />
        </div>

        <DragOverlay>
          {activeCard ? (
            // Full card — content AND footer (shared CandidateCardContent/CandidateCardFooterPreview)
            // — so the drag preview matches the real card exactly, not just its content body.
            <div className="w-72 cursor-grabbing rounded-lg border border-navy/30 border-l-4 border-l-navy/50 bg-white shadow-lg">
              <div className="p-3">
                <CandidateCardContent card={activeCard} />
              </div>
              <CandidateCardFooterPreview card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
