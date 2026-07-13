import { setTargetSchema } from "@/lib/validation/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/**
 * POST /api/daily/targets — set/replace one associate's targets for a day (legacy
 * `ats_targets_set`). LEADERSHIP only (403 otherwise — enforced in the service, never the
 * client); upsert keyed (userId, date); audited. 404 unknown associate; 422 bad body.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = setTargetSchema.parse(await req.json());
  await dailyService.setTarget(input, user);
  return json({ ok: true });
});
