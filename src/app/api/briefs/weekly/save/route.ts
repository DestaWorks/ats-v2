import { saveWeeklyBriefSchema } from "@/lib/validation/briefs";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { briefService } from "@/server/services/brief.service";

/**
 * POST /api/briefs/weekly/save — persist the (possibly edited) draft (legacy `weekly_brief_save`).
 * LEADERSHIP only (`viewReports`) — matching Daily Brief's 2026-08-04 gate; was `requireUser()`,
 * an oversight the same design pass missed.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  const input = saveWeeklyBriefSchema.parse(await req.json());
  return json(await briefService.saveWeekly(input, user));
});
