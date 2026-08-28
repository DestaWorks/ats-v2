import { toggleGoalSchema, type AcknowledgedDTO } from "@destaworks/contracts/validation/daily";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { dailyService } from "@destaworks/application/daily.service";

/** Response body of `PATCH /api/daily/journal/goals/:id`. */
export type PatchDailyJournalGoalResponse = AcknowledgedDTO;

/**
 * PATCH /api/daily/journal/goals/:id — toggle done/undone. A REAL update scoped to the owner
 * (the legacy toggle appended a duplicate row). 404 someone-else's/missing goal.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = toggleGoalSchema.parse(await req.json());
  await dailyService.setGoalDone(id, input.done, user);
  return json<PatchDailyJournalGoalResponse>({ ok: true });
});
