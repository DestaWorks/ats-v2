"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { JourneyDTO, JourneyEventDTO } from "@/lib/validation/journey";
import { getJson, messageForFailure } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { noteTypeLabel } from "./lib/notes-format";

/** Crisp 16px stroke icons (text glyphs render off-center in a small circle). */
const ICONS: Record<string, ReactNode> = {
  plus: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  arrowRight: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  ),
  arrowUp: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13V3M4 7l4-4 4 4" />
    </svg>
  ),
  target: (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
    >
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  pencil: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.3 2.7a1.6 1.6 0 0 1 2.3 2.3L5 13.5l-3 .7.7-3z" />
    </svg>
  ),
  envelope: (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3.5" width="12" height="9" rx="1.2" />
      <path d="m2.5 4.5 5.5 4 5.5-4" />
    </svg>
  ),
};

/** Circle color + icon + default title + detail-bar accent per event kind (legacy palette). */
const KIND_STYLE: Record<
  JourneyEventDTO["kind"],
  { icon: ReactNode; bg: string; border: string; title: string }
> = {
  sourced: { icon: ICONS.target, bg: "bg-navy", border: "border-navy/60", title: "Sourced" },
  promoted: {
    icon: ICONS.arrowUp,
    bg: "bg-purple",
    border: "border-purple/60",
    title: "Promoted to pipeline",
  },
  created: {
    icon: ICONS.plus,
    bg: "bg-navy",
    border: "border-navy/60",
    title: "Added to pipeline",
  },
  stage: { icon: ICONS.arrowRight, bg: "bg-teal", border: "border-teal/60", title: "Stage moved" },
  note: { icon: ICONS.pencil, bg: "bg-gray", border: "border-gray/50", title: "Note" },
  outreach: { icon: ICONS.envelope, bg: "bg-teal", border: "border-teal/60", title: "Outreach" },
};

function eventTitle(e: JourneyEventDTO): string {
  if (e.kind === "note" && e.noteType) return noteTypeLabel(e.noteType);
  if (e.kind === "outreach" && e.channel) return `Outreach — ${e.channel}`;
  return KIND_STYLE[e.kind].title;
}

/** "Jun 19, 2026, 4:00 PM" — the legacy timestamp (no seconds). */
function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Journey" button + timeline modal (legacy CANDIDATE JOURNEY parity): serif name + context
 * subtitle up top, then every event as a colored icon circle on a vertical line — title,
 * "date · by actor", and the context line as a gray bar with the event-colored left border.
 * Composed SERVER-side (`GET /api/candidates/:id/journey`; notes viewer-scoped there); fetched
 * per open so it's always fresh. Detail text renders as escaped React children (D-3).
 */
export function JourneyButton({
  candidateId,
  candidateName,
  subtitle,
}: {
  candidateId: string;
  candidateName: string;
  /** Context line under the name (credential · state · client · stage), built by the header. */
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        🏛 Journey
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Candidate journey">
        {open ? (
          <JourneyTimeline
            candidateId={candidateId}
            candidateName={candidateName}
            subtitle={subtitle}
          />
        ) : null}
      </Modal>
    </>
  );
}

function JourneyTimeline({
  candidateId,
  candidateName,
  subtitle,
}: {
  candidateId: string;
  candidateName: string;
  subtitle?: string;
}) {
  const [journey, setJourney] = useState<JourneyDTO | null>(null);

  useEffect(() => {
    void getJson<JourneyDTO>(`/api/candidates/${candidateId}/journey`).then((res) => {
      if (res.ok) setJourney(res.data);
      else toast.error(messageForFailure(res.failure));
    });
  }, [candidateId]);

  return (
    <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <h3 className="font-serif text-xl font-bold text-charcoal">{candidateName}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-gray">{subtitle}</p> : null}
        {journey ? (
          <p className="mt-0.5 text-xs text-gray">
            {journey.events.length} event{journey.events.length === 1 ? "" : "s"} · spans{" "}
            {journey.spanDays} day{journey.spanDays === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {!journey ? (
        <p className="text-sm text-gray">Loading…</p>
      ) : journey.events.length === 0 ? (
        <p className="text-sm text-gray">No events yet.</p>
      ) : (
        <ol className="flex flex-col">
          {journey.events.map((e, i) => {
            const style = KIND_STYLE[e.kind];
            const last = i === journey.events.length - 1;
            return (
              <li key={i} className="relative flex gap-3.5 pb-6">
                {/* The vertical connector line (skipped after the last event). */}
                {!last ? (
                  <span
                    aria-hidden
                    className="absolute top-9 bottom-0 left-[17px] w-px bg-black/10"
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm",
                    style.bg,
                  )}
                >
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-tight font-bold text-charcoal">{eventTitle(e)}</p>
                  <p className="mt-0.5 text-xs text-gray">
                    {formatAt(e.at)}
                    {e.actorName ? ` · by ${e.actorName}` : ""}
                  </p>
                  {e.detail ? (
                    <p
                      className={cn(
                        "mt-2 rounded-md border-l-[3px] bg-black/[0.035] px-3 py-2 text-sm whitespace-pre-wrap text-charcoal",
                        style.border,
                      )}
                    >
                      {e.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
