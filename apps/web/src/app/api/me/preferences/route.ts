import {
  updatePreferencesSchema,
  type UserPreferencesDTO,
} from "@destaworks/contracts/validation/user-preferences";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { userPreferencesService } from "@destaworks/application/user-preferences.service";

/** Response body of `GET /api/me/preferences`. */
export type GetMePreferencesResponse = UserPreferencesDTO;

/** Response body of `PATCH /api/me/preferences`. */
export type PatchMePreferencesResponse = UserPreferencesDTO;

/**
 * GET /api/me/preferences — the signed-in user's own email signature + sticky note (Wave 4.1,
 * Templates). PATCH updates either/both. No id param, no capability — always "me".
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json<GetMePreferencesResponse>(await userPreferencesService.getMine(user));
});

export const PATCH = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = updatePreferencesSchema.parse(await req.json());
  return json<PatchMePreferencesResponse>(await userPreferencesService.updateMine(user, input));
});
