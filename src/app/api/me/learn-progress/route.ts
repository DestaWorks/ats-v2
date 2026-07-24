import { updateLearnProgressSchema } from "@/lib/validation/learn";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { learnService } from "@/server/services/learn.service";

/**
 * GET /api/me/learn-progress — the signed-in user's per-chapter completion map (Wave 5.4).
 * PATCH marks one chapter complete/not-complete. No id param, no capability — always "me".
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json(await learnService.getMine(user));
});

export const PATCH = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = updateLearnProgressSchema.parse(await req.json());
  return json(await learnService.setChapter(user, input.chapterId, input.done));
});
