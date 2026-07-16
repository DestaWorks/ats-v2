import { Button } from "@/components/ui/button";
import type { SaveScreeningInput } from "@/lib/validation/screening";

/**
 * Save / Advance / Move-to-Future-Pipeline — Save is always visible; Advance shows only at ≥75%,
 * Move to Future Pipeline only at <60%; nothing extra at 60-74% (Conditional). Matches legacy's
 * conditional buttons exactly (`legacy/index.html:6918-6920`) — the recruiter always clicks to
 * move, nothing fires silently.
 */
export function ScreeningActions({
  totalPct,
  pending,
  onSubmit,
}: {
  totalPct: number;
  pending: boolean;
  onSubmit: (action: SaveScreeningInput["action"]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-4">
      <Button type="button" variant="success" loading={pending} onClick={() => onSubmit("save")}>
        Save Scorecard
      </Button>
      {totalPct >= 75 ? (
        <Button
          type="button"
          variant="primary"
          loading={pending}
          onClick={() => onSubmit("advance")}
        >
          Advance to Submission →
        </Button>
      ) : null}
      {totalPct < 60 ? (
        <Button
          type="button"
          variant="secondary"
          loading={pending}
          onClick={() => onSubmit("futurePipeline")}
        >
          Move to Future Pipeline
        </Button>
      ) : null}
    </div>
  );
}
