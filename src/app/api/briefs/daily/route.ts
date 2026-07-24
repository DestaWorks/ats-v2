import { DATE_KEY_RE, dateKey } from "@/lib/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { briefService } from "@/server/services/brief.service";

/** GET /api/briefs/daily?date=YYYY-MM-DD — the saved brief for that day, or `null`. */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const date = DATE_KEY_RE.test(rawDate) ? rawDate : dateKey();
  return json(await briefService.getDaily(date));
});
