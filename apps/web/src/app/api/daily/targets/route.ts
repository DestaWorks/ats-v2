import { setTargetSchema } from "@destaworks/contracts/validation/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `POST /api/daily/targets`. */
export type PostDailyTargetsResponse = { ok: true };

/**
 * POST /api/daily/targets — set/replace one associate's targets for a day (legacy
 * `ats_targets_set`). LEADERSHIP only (403 otherwise — enforced in the service, never the
 * client); upsert keyed (userId, date); audited. 404 unknown associate; 422 bad body.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = setTargetSchema.parse(await req.json());
  await dailyService.setTarget(input, user);
  return json<PostDailyTargetsResponse>({ ok: true });
});
