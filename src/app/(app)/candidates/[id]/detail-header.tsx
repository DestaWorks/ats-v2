"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { statusLabel, type CandidateStatus } from "@/lib/constants";
import type { CandidateDetailDTO, CandidateProfileDTO } from "@/lib/validation/candidate";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StageMover } from "./stage-mover";
import { JourneyButton } from "./journey-modal";
import type { MovedFields } from "./lib/detail-fetch";

const MS_PER_DAY = 86_400_000;

/**
 * Detail header (legacy modal-header parity): serif name; the chips row (license state ·
 * credential · FILLED status pill · TRACK chip); the compact "Move to" stage select; then the
 * fit line — "{pct}% match for {client}" (tone by score) + "N days in current stage". `scoring`
 * is `null` when there's nothing to score against — the match chip then hides. In the MODAL
 * rendering (`inModal`) the top-right cluster is Journey + Close (legacy dialog header) and the
 * back-link is dropped; the full page shows the back-link + Journey. (Delete is intentionally
 * absent for now — trash entry stays on the list/board flows.)
 */
export function DetailHeader({
  candidate,
  clientName,
  scoring,
  onMoved,
  announce,
  inModal = false,
}: {
  candidate: CandidateProfileDTO;
  clientName: string | null;
  scoring: CandidateDetailDTO["scoring"];
  onMoved: (fields: MovedFields) => void;
  announce: (message: string) => void;
  inModal?: boolean;
}) {
  const router = useRouter();
  const daysInStage = Math.max(
    0,
    Math.floor((Date.now() - new Date(candidate.stageEnteredAt).getTime()) / MS_PER_DAY),
  );

  return (
    <header className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white p-6">
      {!inModal ? (
        <div>
          <Link href="/pipeline" className="text-sm font-semibold text-navy hover:underline">
            ← Back to board
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {/* Legacy dialog header: name on the left, Journey (+ Close in the modal) on the right. */}
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-charcoal">{candidate.name}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <JourneyButton candidateId={candidate.id} candidateName={candidate.name} />
            {inModal ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => router.back()}>
                Close
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {candidate.licenseState ? <Badge tone="navy">{candidate.licenseState}</Badge> : null}
          {candidate.credential ? <Badge tone="success">{candidate.credential}</Badge> : null}
          {/* Current stage — the FILLED pill (legacy). */}
          <span className="rounded-full bg-navy px-3 py-0.5 text-[11px] font-semibold text-white">
            {statusLabel(candidate.status as CandidateStatus)}
          </span>
          <span className="rounded-full border border-green/40 bg-green/5 px-3 py-0.5 text-[11px] font-semibold tracking-wide text-green uppercase">
            {candidate.track} track
          </span>
        </div>
      </div>

      <StageMover candidate={candidate} onMoved={onMoved} announce={announce} />

      <div className="flex flex-wrap items-center gap-2">
        {scoring ? (
          <span
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              scoring.pct >= 70
                ? "bg-green/10 text-charcoal"
                : scoring.pct >= 40
                  ? "bg-orange/10 text-charcoal"
                  : "bg-red/10 text-charcoal",
            )}
          >
            <span
              className={cn(
                "font-bold",
                scoring.pct >= 70 ? "text-green" : scoring.pct >= 40 ? "text-orange" : "text-red",
              )}
            >
              {scoring.pct}% match
            </span>{" "}
            {clientName ? `for ${clientName}` : null}
          </span>
        ) : (
          <span className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm text-gray">
            {clientName ?? "Unassigned"}
          </span>
        )}
        <span className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm text-charcoal">
          {daysInStage} day{daysInStage === 1 ? "" : "s"} in current stage
        </span>
      </div>
    </header>
  );
}
