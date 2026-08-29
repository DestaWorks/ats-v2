import { DATE_KEY_RE, dateKeyForOffset } from "@destaworks/domain/daily";
import type { DailyBriefDTO } from "@destaworks/contracts/validation/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { viewerTzOffset } from "@destaworks/integrations/http/viewer-tz";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `GET /api/briefs/daily` — `null` when no brief is saved for that day. */
export type GetBriefsDailyResponse = DailyBriefDTO | null;

/**
 * GET /api/briefs/daily?date=YYYY-MM-DD — the saved brief for that day, or `null`. LEADERSHIP
 * only (`viewReports`, design pass 2026-08-04 — was `requireUser`, open to any signed-in role;
 * this is a team-wide AI report, not personal data, now folded into Daily Log's leadership
 * section instead of its own nav item).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  const params = new URL(req.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const date = DATE_KEY_RE.test(rawDate)
    ? rawDate
    : dateKeyForOffset((await viewerTzOffset()) ?? 0);
  return json<GetBriefsDailyResponse>(await briefService.getDaily(date, user));
});
