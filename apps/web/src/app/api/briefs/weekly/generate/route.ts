import {
  generateWeeklyBriefSchema,
  type WeeklyBriefAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `POST /api/briefs/weekly/generate` — the unsaved AI draft. */
export type PostBriefsWeeklyGenerateResponse = WeeklyBriefAiOutput;

/**
 * POST /api/briefs/weekly/generate — assemble live context + call the AI (legacy
 * `weekly_brief_generate`). Returns a draft; nothing is persisted until `/save`. LEADERSHIP only
 * (`viewReports`) — a team-wide, paid-LLM-call report, matching Daily Brief's 2026-08-04 gate;
 * was `requireUser()`, an oversight the same design pass missed.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`briefs-weekly-generate:${user.id}`, { limit: 10, windowMs: 60_000 });
  const input = generateWeeklyBriefSchema.parse(await req.json());
  return json<PostBriefsWeeklyGenerateResponse>(await briefService.generateWeekly(input));
});
