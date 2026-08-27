import {
  submitLogSchema,
  tzOffsetSchema,
  type DailyLogDTO,
  type DailyLogViewDTO,
} from "@destaworks/contracts/validation/daily";
import { DATE_KEY_RE, dateKeyForOffset } from "@destaworks/domain/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `GET /api/daily/log`. */
export type GetDailyLogResponse = DailyLogViewDTO;

/** Response body of `POST /api/daily/log`. */
export type PostDailyLogResponse = { log: DailyLogDTO };

/**
 * GET /api/daily/log?date&tz — the Daily Log page composite for the SESSION user (today's log
 * or the form's auto-capture counts, tenure ramp, streak, history, week goals, journal notes).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const tz = tzOffsetSchema.parse(params.get("tz") ?? undefined);
  const date = DATE_KEY_RE.test(rawDate) ? rawDate : dateKeyForOffset(tz);
  return json<GetDailyLogResponse>(await dailyService.logView(user, date, tz));
});

/**
 * POST /api/daily/log — submit the day's self-report (legacy `ats_log`/`daily_log`). ONE per
 * user/day (409 on resubmit); the server snapshots the auto-capture counts at submit time.
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = submitLogSchema.parse(await req.json());
  return json<PostDailyLogResponse>({ log: await dailyService.submitLog(input, user) }, 201);
});
