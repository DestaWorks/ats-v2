import {
  recapQuerySchema,
  RECAP_MAX_LOOKBACK_DAYS,
  type RecapDTO,
} from "@destaworks/contracts/validation/daily";
import { MS_PER_DAY } from "@destaworks/domain/clock";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `GET /api/daily/recap`. */
export type GetDailyRecapResponse = RecapDTO;

/**
 * GET /api/daily/recap?since=<ISO> — the "Since you closed" buckets (candidates added, stage
 * moves, outreach) computed from DOMAIN tables, so it needs no audit-log capability. `since` is
 * capped at 14 days back (a stale localStorage timestamp must not scan history). 401 unauth.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { since: raw } = recapQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const floor = Date.now() - RECAP_MAX_LOOKBACK_DAYS * MS_PER_DAY;
  const since = raw.getTime() < floor ? new Date(floor) : raw;
  return json<GetDailyRecapResponse>(await dailyService.recap(since, user));
});
