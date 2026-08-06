import { generateWeeklyBriefSchema } from "@/lib/validation/briefs";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { briefService } from "@/server/services/brief.service";

/**
 * POST /api/briefs/weekly/generate — assemble live context + call the AI (legacy
 * `weekly_brief_generate`). Returns a draft; nothing is persisted until `/save`. LEADERSHIP only
 * (`viewReports`) — a team-wide, paid-LLM-call report, matching Daily Brief's 2026-08-04 gate;
 * was `requireUser()`, an oversight the same design pass missed.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  checkRateLimit(`briefs-weekly-generate:${user.id}`, { limit: 10, windowMs: 60_000 });
  const input = generateWeeklyBriefSchema.parse(await req.json());
  return json(await briefService.generateWeekly(input));
});
