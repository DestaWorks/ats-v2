"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { JourneyDTO, JourneyEventDTO } from "@/lib/validation/journey";
import { getJson, messageForFailure } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { noteTypeLabel } from "./lib/notes-format";

/** Icon glyph + circle color per event kind (legacy journey palette). */
const KIND_STYLE: Record<JourneyEventDTO["kind"], { icon: string; bg: string; title: string }> = {
  sourced: { icon: "🎯", bg: "bg-navy", title: "Sourced" },
  promoted: { icon: "↑", bg: "bg-purple", title: "Promoted to pipeline" },
  created: { icon: "+", bg: "bg-navy", title: "Added to pipeline" },
  stage: { icon: "→", bg: "bg-green", title: "Stage moved" },
  note: { icon: "✎", bg: "bg-gray", title: "Note" },
  outreach: { icon: "✉", bg: "bg-teal", title: "Outreach" },
};

function eventTitle(e: JourneyEventDTO): string {
  if (e.kind === "note" && e.noteType) return noteTypeLabel(e.noteType);
  if (e.kind === "outreach" && e.channel) return `Outreach — ${e.channel}`;
  return KIND_STYLE[e.kind].title;
}

/**
 * "Journey" button + timeline modal (legacy CANDIDATE JOURNEY parity): every event as a colored
 * icon circle on a vertical line — title, "date · by actor", and the quoted context line.
 * Composed SERVER-side (`GET /api/candidates/:id/journey`; notes viewer-scoped there); fetched
 * per open so it's always fresh. Detail text renders as escaped React children (D-3).
 */
export function JourneyButton({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        🏛 Journey
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Candidate journey — ${candidateName}`}
      >
        {open ? <JourneyTimeline candidateId={candidateId} /> : null}
      </Modal>
    </>
  );
}

function JourneyTimeline({ candidateId }: { candidateId: string }) {
  const [journey, setJourney] = useState<JourneyDTO | null>(null);

  useEffect(() => {
    void getJson<JourneyDTO>(`/api/candidates/${candidateId}/journey`).then((res) => {
      if (res.ok) setJourney(res.data);
      else toast.error(messageForFailure(res.failure));
    });
  }, [candidateId]);

  if (!journey) return <p className="text-sm text-gray">Loading…</p>;
  if (journey.events.length === 0) {
    return <p className="text-sm text-gray">No events yet.</p>;
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <p className="text-xs text-gray">
        {journey.events.length} event{journey.events.length === 1 ? "" : "s"} · spans{" "}
        {journey.spanDays} day{journey.spanDays === 1 ? "" : "s"}
      </p>
      <ol className="flex flex-col">
        {journey.events.map((e, i) => {
          const style = KIND_STYLE[e.kind];
          const last = i === journey.events.length - 1;
          return (
            <li key={i} className="relative flex gap-3 pb-5">
              {/* The vertical connector line (skipped after the last event). */}
              {!last ? (
                <span
                  aria-hidden
                  className="absolute top-8 bottom-0 left-[15px] w-px bg-black/10"
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-white",
                  style.bg,
                )}
              >
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-charcoal">{eventTitle(e)}</p>
                <p className="text-xs text-gray">
                  {new Date(e.at).toLocaleString()}
                  {e.actorName ? ` · by ${e.actorName}` : ""}
                </p>
                {e.detail ? (
                  <p className="mt-1.5 rounded-r-md border-l-2 border-black/15 bg-black/[0.03] px-3 py-1.5 text-sm whitespace-pre-wrap text-charcoal">
                    {e.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
