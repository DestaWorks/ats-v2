import { saveActualsSchema } from "@/lib/validation/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/**
 * POST /api/daily/actuals — End of Shift (legacy `ats_actuals_save`): the SESSION user confirms
 * the day's numbers (pre-filled client-side from live actuals). Upsert keyed (userId, date);
 * audited. 422 bad body; 401 unauth.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = saveActualsSchema.parse(await req.json());
  await dailyService.saveActuals(input, user);
  return json({ ok: true });
});
