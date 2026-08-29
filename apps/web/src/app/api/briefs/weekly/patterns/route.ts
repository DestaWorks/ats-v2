import {
  weeklyPatternsSchema,
  type WeeklyPatternsAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `POST /api/briefs/weekly/patterns` — generate-only, never persisted. */
export type PostBriefsWeeklyPatternsResponse = WeeklyPatternsAiOutput;

/**
 * POST /api/briefs/weekly/patterns — 4-week trend/anomaly detection (legacy
 * `weekly_brief_patterns`). Generate-only, never persisted (matches legacy). LEADERSHIP only
 * (`viewReports`) — a team-wide, paid-LLM-call report, matching Daily Brief's 2026-08-04 gate;
 * was `requireUser()`, an oversight the same design pass missed.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`briefs-weekly-patterns:${user.user.id}`, { limit: 10, windowMs: 60_000 });
  const input = weeklyPatternsSchema.parse(await req.json());
  return json<PostBriefsWeeklyPatternsResponse>(await briefService.generatePatterns(input, user));
});
