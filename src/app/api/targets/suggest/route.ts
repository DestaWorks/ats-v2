import { suggestTargetsSchema } from "@/lib/validation/briefs";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { briefService } from "@/server/services/brief.service";

/**
 * POST /api/targets/suggest — AI-suggested day targets for one associate (legacy
 * `ats_targets_suggest`), feeding the existing Wave 3.1 manager target-setting modal.
 * LEADERSHIP only — same `viewReports` gate `dailyService.setTarget` uses (`SET_TARGETS_CAP`).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`targets-suggest:${user.id}`, { limit: 20, windowMs: 60_000 });
  const input = suggestTargetsSchema.parse(await req.json());
  return json(await briefService.suggestTargets(input));
});
