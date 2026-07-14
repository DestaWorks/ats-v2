import { toggleGoalSchema } from "@/lib/validation/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/**
 * PATCH /api/daily/journal/goals/:id — toggle done/undone. A REAL update scoped to the owner
 * (the legacy toggle appended a duplicate row). 404 someone-else's/missing goal.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = toggleGoalSchema.parse(await req.json());
  await dailyService.setGoalDone(id, input.done, user);
  return json({ ok: true });
});
