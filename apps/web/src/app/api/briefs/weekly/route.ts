import { DATE_KEY_RE, dateKeyForOffset, mondayOf } from "@destaworks/domain/daily";
import type * as Contract from "@destaworks/contracts/http/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { viewerTzOffset } from "@destaworks/integrations/http/viewer-tz";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `GET /api/briefs/weekly` — `null` when no brief is saved for that week. */
export type GetBriefsWeeklyResponse = Contract.GetBriefsWeeklyResponse;

/**
 * GET /api/briefs/weekly?weekStart=YYYY-MM-DD — the saved brief for that week, or `null`.
 * LEADERSHIP only (`viewReports`) — a team-wide AI report, matching Daily Brief's
 * 2026-08-04 gate; was `requireUser()`, an oversight the same design pass missed.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  const params = new URL(req.url).searchParams;
  const raw = params.get("weekStart");
  const weekStart = mondayOf(
    raw && DATE_KEY_RE.test(raw) ? raw : dateKeyForOffset((await viewerTzOffset()) ?? 0),
  );
  return json<GetBriefsWeeklyResponse>(await briefService.getWeekly(weekStart, user));
});
