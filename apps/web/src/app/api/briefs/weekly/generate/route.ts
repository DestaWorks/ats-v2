import { generateWeeklyBriefSchema } from "@destaworks/contracts/validation/briefs";
import type { EnqueuedJobResponse } from "@destaworks/contracts/validation/jobs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { requireBriefGenerationEnqueuer } from "@destaworks/application/brief-generation.port";

/** Response body of `POST /api/briefs/weekly/generate` — the queued job, NOT the draft. */
export type PostBriefsWeeklyGenerateResponse = EnqueuedJobResponse;

/**
 * POST /api/briefs/weekly/generate — QUEUE the AI generation (legacy `weekly_brief_generate`).
 *
 * The longest prompt in the app; see the daily route for why it is a job now and what a client
 * does with the id. Singleton per ISO WEEK, so the several spellings of "this week" that reach
 * the server are one run. LEADERSHIP only (`viewReports`).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`briefs-weekly-generate:${user.user.id}`, { limit: 10, windowMs: 60_000 });
  const input = generateWeeklyBriefSchema.parse(await req.json());
  const queued = await requireBriefGenerationEnqueuer().weekly(input);
  return json<PostBriefsWeeklyGenerateResponse>(queued, 202);
});
