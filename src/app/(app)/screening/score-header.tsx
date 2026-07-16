import type { ScreeningResult } from "@/lib/rules/screening";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";

/** Score/decision thresholds are Screening's own legacy-specified business rule (75/60) — a
 *  distinct concept from the fit-score `HOT_SCORE` threshold, so this uses its own tone map
 *  rather than the shared `scoreTone` helper. */
const DECISION_TONE: Record<ScreeningResult["decision"], BadgeTone> = {
  Advance: "success",
  Conditional: "amber",
  Hold: "danger",
};

const SECTION_LABELS: Record<keyof ScreeningResult["sections"], string> = {
  cred: "Credential",
  state: "State",
  exp: "Experience",
  schedule: "Schedule",
  salary: "Salary",
  comm: "Comm.",
};

/** Total % + decision banner + 6 mini section scores — legacy's colored header block
 *  (`legacy/index.html:6821-6831`). */
export function ScoreHeader({ result }: { result: ScreeningResult }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray uppercase">Overall Score</p>
          <p className="text-3xl font-bold text-charcoal">{result.totalPct}%</p>
        </div>
        <Badge tone={DECISION_TONE[result.decision]} className="px-3 py-1 text-sm">
          {result.decision}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(Object.keys(result.sections) as (keyof ScreeningResult["sections"])[]).map((key) => (
          <div key={key} className="rounded-md bg-black/[0.02] p-2 text-center">
            <p className="text-[10px] font-semibold tracking-wide text-gray uppercase">
              {SECTION_LABELS[key]}
            </p>
            <p className="text-sm font-bold text-charcoal">{result.sections[key]}%</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
