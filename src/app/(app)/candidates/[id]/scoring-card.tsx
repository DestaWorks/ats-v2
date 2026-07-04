import type { CandidateDetailDTO } from "@/lib/validation/candidate";
import { Card } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score-badge";

/**
 * Client-fit breakdown for the Details tab: the fit `ScoreBadge`, the soft `flags` explaining why
 * the score isn't 100, and an ADVISORY auto-disqualify banner. The banner is display-only — it never
 * moves the candidate to a terminal status (that stays a manual action via the stage-mover). When
 * there's nothing to score against (no client / no rules / the rules constrain nothing) it prompts to
 * assign a client.
 */
export function ScoringCard({
  scoring,
  clientName,
}: {
  scoring: CandidateDetailDTO["scoring"];
  clientName: string | null;
}) {
  if (!scoring) {
    return (
      <Card className="p-4">
        <h3 className="mb-2 text-xs font-bold tracking-wide text-gray uppercase">Client fit</h3>
        <p className="text-sm text-gray">Assign a client to see fit score.</p>
      </Card>
    );
  }

  const forClient = clientName ? ` for ${clientName}` : "";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-gray uppercase">Client fit</h3>
        <ScoreBadge score={scoring.pct} />
      </div>

      {scoring.autoDisqualify.length > 0 ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red/20 bg-red/5 p-3 text-sm text-red"
        >
          <p className="font-semibold">
            Advisory: this candidate would be auto-disqualified{forClient}:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {scoring.autoDisqualify.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-red/80">
            Advisory only — nothing happens automatically. Moving stages stays a manual action.
          </p>
        </div>
      ) : null}

      {scoring.flags.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-gray">Why it isn&apos;t 100%</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm text-charcoal">
            {scoring.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-green">Full match{forClient}.</p>
      )}

      <p className="mt-2 text-xs text-gray">
        {scoring.score} of {scoring.max} points
      </p>
    </Card>
  );
}
