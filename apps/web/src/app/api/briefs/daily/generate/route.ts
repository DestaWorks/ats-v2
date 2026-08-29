import { generateDailyBriefRequestSchema } from "@destaworks/contracts/validation/briefs";
import type { EnqueuedJobResponse } from "@destaworks/contracts/validation/jobs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { requireBriefGenerationEnqueuer } from "@destaworks/application/brief-generation.port";

/** Response body of `POST /api/briefs/daily/generate` — the queued job, NOT the draft. */
export type PostBriefsDailyGenerateResponse = EnqueuedJobResponse;

/**
 * POST /api/briefs/daily/generate — QUEUE the AI generation (legacy `daily_brief_generate`).
 *
 * Phase 5 moved the work off the request path: this is one of the two slowest AI calls in the app
 * and it used to hold a function slot for the whole run, retries included. It now answers 202 with
 * a job id; the job writes its output to that day's `draft`, which `GET /api/briefs/daily` returns
 * alongside the saved brief. Nothing is persisted as the brief until `/save`, exactly as before.
 *
 * Enqueuing is a singleton per DAY, so clicking generate twice costs one AI run and returns the
 * same job id. The rate limit stays regardless — it caps how fast anyone can queue distinct days.
 * LEADERSHIP only (`viewReports`, design pass 2026-08-04).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`briefs-daily-generate:${user.user.id}`, { limit: 20, windowMs: 60_000 });
  const input = generateDailyBriefRequestSchema.parse(await req.json());
  const queued = await requireBriefGenerationEnqueuer().daily(input, user.tenantId);
  return json<PostBriefsDailyGenerateResponse>(queued, 202);
});
