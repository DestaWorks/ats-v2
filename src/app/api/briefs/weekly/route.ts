import { dateKey, mondayOf } from "@/lib/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { briefService } from "@/server/services/brief.service";

/** GET /api/briefs/weekly?weekStart=YYYY-MM-DD — the saved brief for that week, or `null`. */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const raw = params.get("weekStart");
  const weekStart = mondayOf(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dateKey());
  return json(await briefService.getWeekly(weekStart));
});
