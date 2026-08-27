import { addFeedbackSchema } from "@/lib/validation/daily";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { dailyService } from "@/server/services/daily.service";

/** Response body of `POST /api/daily/manager-feedback`. */
export type PostDailyManagerFeedbackResponse = { ok: true };

/**
 * POST /api/daily/manager-feedback — post a feedback note to an associate (Wave 3.1 backlog,
 * legacy `mgr_feedback`). LEADERSHIP only — enforced in the service, never the client (mirrors
 * `POST /api/daily/targets`). 404 unknown associate; 422 bad body.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = addFeedbackSchema.parse(await req.json());
  await dailyService.addFeedback(input, user);
  return json<PostDailyManagerFeedbackResponse>({ ok: true });
});
