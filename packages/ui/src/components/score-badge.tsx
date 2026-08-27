import { Badge } from "./badge";
import { isHot, scoreTone } from "./score-badge.helpers";

/**
 * Fit-score pill — composes the shared `Badge` with the score color scale (see `scoreTone`):
 * `≥ 80` green · `50–79` amber · `< 50` neutral. A `null` score renders as a muted "—" (never
 * "0%"); a real `0` is a legitimate low score and DOES render. When the score is "hot"
 * (`≥ HOT_SCORE`, see `isHot`) a small "Hot" chip is appended.
 *
 * a11y: the visible "82%" / "—" text is never color-only, and each variant carries a descriptive
 * `aria-label` via `role="img"` so screen readers announce the fit (and hot state) as one unit.
 * The flame is `aria-hidden` — "Hot" is always conveyed in text.
 */
export function ScoreBadge({
  score,
  showHot = true,
}: {
  score: number | null;
  /** Suppress the "Hot" chip (e.g. tight table cells). Defaults to shown. */
  showHot?: boolean;
}) {
  if (score === null) {
    return (
      <span
        role="img"
        aria-label="No score — unassigned or no rules"
        className="text-[11px] font-medium text-gray"
      >
        —
      </span>
    );
  }

  const hot = showHot && isHot(score);

  return (
    <span
      role="img"
      aria-label={`Fit score ${score} percent${hot ? ", hot candidate" : ""}`}
      className="inline-flex items-center gap-1"
    >
      <Badge tone={scoreTone(score)}>{score}%</Badge>
      {hot ? (
        <Badge tone="success" size="sm">
          Hot
        </Badge>
      ) : null}
    </span>
  );
}
