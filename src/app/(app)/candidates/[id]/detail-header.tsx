"use client";

import Link from "next/link";
import type { CandidateProfileDTO } from "@/lib/validation/candidate";
import { Badge } from "@/components/ui/badge";
import { StageMover } from "./stage-mover";
import type { MovedFields } from "./lib/detail-fetch";

/** Detail header: name, credential · track · license-state chips, client, and the stage-mover. */
export function DetailHeader({
  candidate,
  clientName,
  onMoved,
  announce,
}: {
  candidate: CandidateProfileDTO;
  clientName: string | null;
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
          </div>
          <p className="text-sm text-charcoal">
            {clientName ?? <span className="text-gray italic">Unassigned</span>}
          </p>
        </div>

        <StageMover candidate={candidate} onMoved={onMoved} announce={announce} />
      </div>
    </header>
  );
}
