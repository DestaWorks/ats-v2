import { weeklyPatternsSchema } from "@/lib/validation/briefs";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { checkRateLimit } from "@/server/http/rate-limit";
import { briefService } from "@/server/services/brief.service";

/**
 * POST /api/briefs/weekly/patterns — 4-week trend/anomaly detection (legacy
 * `weekly_brief_patterns`). Generate-only, never persisted (matches legacy).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  checkRateLimit(`briefs-weekly-patterns:${user.id}`, { limit: 10, windowMs: 60_000 });
  const input = weeklyPatternsSchema.parse(await req.json());
  return json(await briefService.generatePatterns(input));
});
