import { DATE_KEY_RE, dateKeyForOffset, mondayOf } from "@/lib/daily";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { viewerTzOffset } from "@/server/http/viewer-tz";
import { briefService } from "@/server/services/brief.service";

/**
 * GET /api/briefs/weekly?weekStart=YYYY-MM-DD — the saved brief for that week, or `null`.
 * LEADERSHIP only (`viewReports`) — a team-wide AI report, matching Daily Brief's
 * 2026-08-04 gate; was `requireUser()`, an oversight the same design pass missed.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewReports");
  const params = new URL(req.url).searchParams;
  const raw = params.get("weekStart");
  const weekStart = mondayOf(
    raw && DATE_KEY_RE.test(raw) ? raw : dateKeyForOffset((await viewerTzOffset()) ?? 0),
  );
  return json(await briefService.getWeekly(weekStart));
});
