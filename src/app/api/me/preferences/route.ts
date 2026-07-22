import { updatePreferencesSchema } from "@/lib/validation/user-preferences";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { userPreferencesService } from "@/server/services/user-preferences.service";

/**
 * GET /api/me/preferences — the signed-in user's own email signature + sticky note (Wave 4.1,
 * Templates). PATCH updates either/both. No id param, no capability — always "me".
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json(await userPreferencesService.getMine(user));
});

export const PATCH = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = updatePreferencesSchema.parse(await req.json());
  return json(await userPreferencesService.updateMine(user, input));
});
