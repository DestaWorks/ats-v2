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
import { Spinner } from "@/components/ui/spinner";
import { BoardColumn } from "./board-column";
import { BoardFilters, type ClientOption } from "./board-filters";
import { TerminalRail } from "./terminal-rail";
import { applyBoardMove } from "./lib/optimistic-move";
import { fetchBoard, postMove } from "./lib/board-fetch";
import { TRACK_BADGE } from "./lib/status-style";

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
}: {
  initial: BoardResponse;
  clients: ClientOption[];
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
      <BoardFilters clients={clients} />

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

          {optimisticBoard.columns.map((column) => (
            <BoardColumn
              key={column.status}
              column={column}
              onMove={onMove}
              busy={pending}
              isDragActive={activeCard !== null}
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
            <div className="w-72 rounded-lg border border-navy/30 bg-white p-3 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-sm font-semibold text-charcoal">
                  {activeCard.name}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TRACK_BADGE[activeCard.track].className}`}
                >
                  {TRACK_BADGE[activeCard.track].label}
                </span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
