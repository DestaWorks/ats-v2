import { journalGoalSchema, type JournalGoalDTO } from "@destaworks/contracts/validation/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `POST /api/daily/journal/goals`. */
export type PostDailyJournalGoalsResponse = { goal: JournalGoalDTO };

/** POST /api/daily/journal/goals — add a weekly goal (weekStart normalizes to its Monday). */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = journalGoalSchema.parse(await req.json());
  return json<PostDailyJournalGoalsResponse>(
    { goal: await dailyService.addGoal(input.weekStart, input.text, user) },
    201,
  );
});
