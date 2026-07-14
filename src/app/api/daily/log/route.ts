import { submitLogSchema, tzOffsetSchema } from "@/lib/validation/daily";
import { DATE_KEY_RE, dateKey } from "@/lib/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/**
 * GET /api/daily/log?date&tz — the Daily Log page composite for the SESSION user (today's log
 * or the form's auto-capture counts, tenure ramp, streak, history, week goals, journal notes).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const date = DATE_KEY_RE.test(rawDate) ? rawDate : dateKey();
  const tz = tzOffsetSchema.parse(params.get("tz") ?? undefined);
  return json(await dailyService.logView(user, date, tz));
});

/**
 * POST /api/daily/log — submit the day's self-report (legacy `ats_log`/`daily_log`). ONE per
 * user/day (409 on resubmit); the server snapshots the auto-capture counts at submit time.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = submitLogSchema.parse(await req.json());
  return json({ log: await dailyService.submitLog(input, user) }, 201);
});
