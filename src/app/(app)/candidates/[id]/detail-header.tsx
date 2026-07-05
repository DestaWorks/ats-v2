"use client";

import Link from "next/link";
import type { CandidateDetailDTO, CandidateProfileDTO } from "@/lib/validation/candidate";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StageMover } from "./stage-mover";
import { DeleteCandidateButton } from "./delete-candidate-button";
import type { MovedFields } from "./lib/detail-fetch";

/**
 * Detail header: name, credential · track · license-state chips, the client-fit `ScoreBadge`,
 * client, and the stage-mover. `scoring` is `null` when there's nothing to score against — the
 * badge then renders a muted "—".
 */
export function DetailHeader({
  candidate,
  clientName,
  scoring,
  onMoved,
  announce,
}: {
  candidate: CandidateProfileDTO;
  clientName: string | null;
  scoring: CandidateDetailDTO["scoring"];
  onMoved: (fields: MovedFields) => void;
  announce: (message: string) => void;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white p-6">
      <div>
        <Link href="/pipeline" className="text-sm font-semibold text-navy hover:underline">
          ← Back to board
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-bold text-charcoal">{candidate.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {candidate.credential ? <Badge tone="navy">{candidate.credential}</Badge> : null}
            <Badge tone="neutral">{candidate.track}</Badge>
            {candidate.licenseState ? <Badge tone="neutral">{candidate.licenseState}</Badge> : null}
            <ScoreBadge score={scoring ? scoring.pct : null} />
          </div>
          <p className="text-sm text-charcoal">
            {clientName ?? <span className="text-gray italic">Unassigned</span>}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <StageMover candidate={candidate} onMoved={onMoved} announce={announce} />
          <DeleteCandidateButton
            candidateId={candidate.id}
            candidateName={candidate.name}
            announce={announce}
          />
        </div>
      </div>
    </header>
  );
}
