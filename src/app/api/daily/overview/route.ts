import { tzOffsetSchema } from "@/lib/validation/daily";
import { DATE_KEY_RE, dateKey } from "@/lib/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

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
  const date = DATE_KEY_RE.test(rawDate) ? rawDate : dateKey();
  const tz = tzOffsetSchema.parse(params.get("tz") ?? undefined);
  return json(await dailyService.overview(user, date, tz));
});
