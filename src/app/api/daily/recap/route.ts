import { z } from "zod";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

const sinceSchema = z.coerce.date();

/**
 * GET /api/daily/recap?since=<ISO> — the "Since you closed" buckets (candidates added, stage
 * moves, outreach) computed from DOMAIN tables, so it needs no audit-log capability. `since` is
 * capped at 14 days back (a stale localStorage timestamp must not scan history). 401 unauth.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const raw = sinceSchema.parse(new URL(req.url).searchParams.get("since"));
  const floor = Date.now() - 14 * 86_400_000;
  const since = raw.getTime() < floor ? new Date(floor) : raw;
  return json(await dailyService.recap(since));
});
