import { z } from "zod";
import type { RecapDTO } from "@destaworks/contracts/validation/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

const sinceSchema = z.coerce.date();

/** Response body of `GET /api/daily/recap`. */
export type GetDailyRecapResponse = RecapDTO;

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
  return json<GetDailyRecapResponse>(await dailyService.recap(since));
});
