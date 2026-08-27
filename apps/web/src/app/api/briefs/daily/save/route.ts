import { saveDailyBriefSchema, type DailyBriefDTO } from "@destaworks/contracts/validation/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `POST /api/briefs/daily/save` — the persisted brief. */
export type PostBriefsDailySaveResponse = DailyBriefDTO;

/**
 * POST /api/briefs/daily/save — persist the (possibly edited) draft (legacy `daily_brief_save`).
 * LEADERSHIP only (`viewReports`, design pass 2026-08-04 — was `requireUser`).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  const input = saveDailyBriefSchema.parse(await req.json());
  return json<PostBriefsDailySaveResponse>(await briefService.saveDaily(input, user));
});
