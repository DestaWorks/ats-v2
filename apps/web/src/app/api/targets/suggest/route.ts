import {
  suggestTargetsSchema,
  type TargetsSuggestAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `POST /api/targets/suggest`. */
export type PostTargetsSuggestResponse = TargetsSuggestAiOutput;

/**
 * POST /api/targets/suggest — AI-suggested day targets for one associate (legacy
 * `ats_targets_suggest`), feeding the existing Wave 3.1 manager target-setting modal.
 * LEADERSHIP only — same `viewReports` gate `dailyService.setTarget` uses (`SET_TARGETS_CAP`).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`targets-suggest:${user.user.id}`, { limit: 20, windowMs: 60_000 });
  const input = suggestTargetsSchema.parse(await req.json());
  return json<PostTargetsSuggestResponse>(await briefService.suggestTargets(input, user));
});
