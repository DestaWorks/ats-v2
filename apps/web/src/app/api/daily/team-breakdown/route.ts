import {
  teamBreakdownQuerySchema,
  type TeamBreakdownDTO,
} from "@destaworks/contracts/validation/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `GET /api/daily/team-breakdown`. */
export type GetDailyTeamBreakdownResponse = TeamBreakdownDTO;

/**
 * GET /api/daily/team-breakdown?weekStart= — per-associate weekly self-report rollup (Wave 3.1
 * backlog, legacy `isAdmin`-only Daily Log table). LEADERSHIP only — enforced in the service,
 * never the client (mirrors `POST /api/daily/targets`).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const { weekStart } = teamBreakdownQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  return json<GetDailyTeamBreakdownResponse>(await dailyService.teamBreakdown(weekStart, user));
});
