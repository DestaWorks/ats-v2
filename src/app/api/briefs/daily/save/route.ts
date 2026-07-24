import { saveDailyBriefSchema } from "@/lib/validation/briefs";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { briefService } from "@/server/services/brief.service";

/** POST /api/briefs/daily/save — persist the (possibly edited) draft (legacy `daily_brief_save`). */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = saveDailyBriefSchema.parse(await req.json());
  return json(await briefService.saveDaily(input, user));
});
