/**
 * Wire shapes of the two saved-brief reads.
 *
 * Both are nullable — "no brief saved for that period" is a 200 with a `null` body, not a 404 —
 * and the nullability is the part a caller must handle, so it belongs in the contract both
 * transports share rather than at either handler.
 */
import type { DailyBriefDTO, WeeklyBriefDTO } from "../validation/briefs";

/** Response body of `GET /briefs/daily` — `null` when no brief is saved for that day. */
export type GetBriefsDailyResponse = DailyBriefDTO | null;

/** Response body of `GET /briefs/weekly` — `null` when no brief is saved for that week. */
export type GetBriefsWeeklyResponse = WeeklyBriefDTO | null;
