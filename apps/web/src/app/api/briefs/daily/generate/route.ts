import {
  generateDailyBriefRequestSchema,
  type DailyBriefAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { briefService } from "@destaworks/application/brief.service";

/** Response body of `POST /api/briefs/daily/generate` — the unsaved AI draft. */
export type PostBriefsDailyGenerateResponse = DailyBriefAiOutput;

/**
 * POST /api/briefs/daily/generate — assemble live context + call the AI (legacy
 * `daily_brief_generate`). Returns a draft; nothing is persisted until `/save`. Rate-limited
 * (paid LLM call, mirrors `inbound/triage`'s 20/min). LEADERSHIP only (`viewReports`, design pass
 * 2026-08-04 — was `requireUser`; also closes an unthrottled-by-role paid-LLM-call surface for
 * every signed-in role, not just Associates).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewReports");
  await checkRateLimit(`briefs-daily-generate:${user.id}`, { limit: 20, windowMs: 60_000 });
  const input = generateDailyBriefRequestSchema.parse(await req.json());
  const draft = await briefService.generateDaily(
    { date: input.date, tz: input.tz },
    {
      priorityClientId: input.priorityClientId ?? null,
      shiftA: input.shiftA ?? null,
      shiftB: input.shiftB ?? null,
      watchItems: input.watchItems ?? null,
    },
  );
  return json<PostBriefsDailyGenerateResponse>(draft);
});
