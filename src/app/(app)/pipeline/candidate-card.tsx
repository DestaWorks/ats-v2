"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ALL_STATUS_CODES, statusLabel, type CandidateStatus } from "@/lib/constants";
import type { CandidateCardDTO } from "@/lib/validation/pipeline";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { TRACK_BADGE, licenseDotClass } from "./lib/status-style";

/** Timing badge — overdue (red) / stuck (orange) / plain days-in-stage (gray). */
function TimingBadge({ card }: { card: CandidateCardDTO }) {
  if (card.isOverdue) {
    return (
      <Badge tone="danger" size="sm" pill={false}>
        overdue · {card.daysInStage}d
      </Badge>
    );
  }
  if (card.isStuck) {
    return (
      <Badge tone="amber" size="sm" pill={false}>
        stuck · {card.daysInStage}d
      </Badge>
    );
  }
  return <span className="text-[11px] font-medium text-gray">{card.daysInStage}d in stage</span>;
}

/**
 * The visual body of a pipeline card — name · track · credential · client · score · license · timing.
 * Shared by the interactive `CandidateCard` and the drag overlay so the DRAG PREVIEW matches the real
 * card exactly (previously the overlay showed only name + track, so a dragged card looked truncated).
 * Purely presentational: no drag listeners, no footer actions.
 */
export function CandidateCardContent({ card }: { card: CandidateCardDTO }) {
  const track = TRACK_BADGE[card.track];
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-charcoal">{card.name}</h3>
        {/* Track chip — a bespoke per-track color from status-style.ts (doesn't map onto Badge's tones). */}
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
            track.className,
          )}
        >
          {track.label}
        </span>
      </div>

      <p className="mt-1 text-xs text-gray">
        {card.credential ?? "—"}
        {card.licenseState ? ` · ${card.licenseState}` : ""}
      </p>

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="text-xs text-charcoal">
          {card.clientName ?? <span className="text-gray italic">Unassigned</span>}
        </p>
        <ScoreBadge score={card.score} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", licenseDotClass(card.licenseStatus))}
          />
          <span className="text-[11px] text-gray">{card.licenseStatus}</span>
        </span>
        <TimingBadge card={card} />
      </div>

      {/* Advisory auto-DQ hint — first reason only (legacy parity); display-only, never auto-moves. */}
      {card.dqFlags.length > 0 ? (
        <p className="mt-1.5 text-[11px] text-red italic" title={card.dqFlags.join(" · ")}>
          ⚠ {card.dqFlags[0]}
          {card.dqFlags.length > 1 ? ` (+${card.dqFlags.length - 1})` : ""}
        </p>
      ) : null}
    </>
  );
}

export function CandidateCard({
  card,
  onMove,
  busy,
}: {
  card: CandidateCardDTO;
  onMove: (card: CandidateCardDTO, toStatus: CandidateStatus) => void;
  busy?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    attributes: { roleDescription: "draggable candidate card" },
  });
  // Left-border accent — advisory DQ (red) outranks timing (orange), matching the legacy board.
  const accent =
    card.dqFlags.length > 0
      ? "border-l-red"
      : card.isOverdue || card.isStuck
        ? "border-l-orange"
        : "border-l-transparent";
  const selectId = `move-${card.id}`;

  const ariaLabel = [
    card.name,
    card.credential ?? "no credential",
    statusLabel(card.status),
    `${card.daysInStage} days in stage`,
    card.isOverdue ? "overdue" : card.isStuck ? "stuck" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      className={cn(
        "rounded-lg border border-black/5 border-l-4 bg-white shadow-sm transition",
        accent,
        isDragging && "opacity-40",
      )}
    >
      {/* Drag handle = the card body. The <select> below stays outside the listeners so it
          remains independently operable by keyboard / pointer. */}
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        className="cursor-grab touch-none p-3 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={ariaLabel}
      >
        <CandidateCardContent card={card} />
      </div>

      {/* Footer controls sit OUTSIDE the drag listeners so click/keyboard work without drag ambiguity. */}
      <div className="flex items-center justify-between gap-2 border-t border-black/5 px-3 py-1.5">
        <Link
          href={`/candidates/${card.id}`}
          className="text-[11px] font-semibold text-navy hover:underline"
        >
          View profile
        </Link>
      </div>

      <div className="border-t border-black/5 px-3 py-1.5">
        <label htmlFor={selectId} className="sr-only">
          Move {card.name} to a different stage
        </label>
        <select
          id={selectId}
          value={card.status}
          disabled={busy}
          onChange={(e) => onMove(card, e.target.value as CandidateStatus)}
          className="w-full rounded border border-black/10 bg-white px-1.5 py-1 text-[11px] text-charcoal disabled:opacity-50"
        >
          {ALL_STATUS_CODES.map((code) => (
            <option key={code} value={code}>
              {statusLabel(code)}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
