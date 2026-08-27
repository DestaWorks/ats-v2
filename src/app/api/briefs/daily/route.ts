import { DATE_KEY_RE, dateKeyForOffset } from "@/lib/daily";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { viewerTzOffset } from "@/server/http/viewer-tz";
import { briefService } from "@/server/services/brief.service";

/**
 * GET /api/briefs/daily?date=YYYY-MM-DD — the saved brief for that day, or `null`. LEADERSHIP
 * only (`viewReports`, design pass 2026-08-04 — was `requireUser`, open to any signed-in role;
 * this is a team-wide AI report, not personal data, now folded into Daily Log's leadership
 * section instead of its own nav item).
 */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const params = new URL(req.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const date = DATE_KEY_RE.test(rawDate)
    ? rawDate
    : dateKeyForOffset((await viewerTzOffset()) ?? 0);
  return json(await briefService.getDaily(date));
});
