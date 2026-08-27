import { tzOffsetSchema, type DailyOverviewDTO } from "@destaworks/contracts/validation/daily";
import { DATE_KEY_RE, dateKeyForOffset } from "@destaworks/domain/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `GET /api/daily/overview`. */
export type GetDailyOverviewResponse = DailyOverviewDTO;

/**
 * GET /api/daily/overview?date=YYYY-MM-DD&tz=<getTimezoneOffset()> — the Overview strip
 * composite for the SESSION user: today's target (if set), event-derived live actuals for the
 * user-local day, whether End-of-Shift was submitted, and (leadership) the target-setting
 * options. 401 unauth.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const tz = tzOffsetSchema.parse(params.get("tz") ?? undefined);
  const date = DATE_KEY_RE.test(rawDate) ? rawDate : dateKeyForOffset(tz);
  return json<GetDailyOverviewResponse>(await dailyService.overview(user, date, tz));
});
