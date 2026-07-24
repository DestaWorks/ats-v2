import { z } from "zod";
import { generateDailyBriefSchema } from "@/lib/validation/briefs";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { briefService } from "@/server/services/brief.service";

const requestSchema = generateDailyBriefSchema.extend({
  priorityClientId: z.string().min(1).nullish(),
  shiftA: z.string().trim().max(2000).nullish(),
  shiftB: z.string().trim().max(2000).nullish(),
  watchItems: z.string().trim().max(2000).nullish(),
});

/**
 * POST /api/briefs/daily/generate — assemble live context + call the AI (legacy
 * `daily_brief_generate`). Returns a draft; nothing is persisted until `/save`. Rate-limited
 * (paid LLM call, mirrors `inbound/triage`'s 20/min).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  checkRateLimit(`briefs-daily-generate:${user.id}`, { limit: 20, windowMs: 60_000 });
  const input = requestSchema.parse(await req.json());
  const draft = await briefService.generateDaily(
    { date: input.date, tz: input.tz },
    {
      priorityClientId: input.priorityClientId ?? null,
      shiftA: input.shiftA ?? null,
      shiftB: input.shiftB ?? null,
      watchItems: input.watchItems ?? null,
    },
  );
  return json(draft);
});
