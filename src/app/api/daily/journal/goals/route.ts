import { journalGoalSchema } from "@/lib/validation/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/** POST /api/daily/journal/goals — add a weekly goal (weekStart normalizes to its Monday). */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = journalGoalSchema.parse(await req.json());
  return json({ goal: await dailyService.addGoal(input.weekStart, input.text, user) }, 201);
});
