import {
  uploadAvatarSchema,
  type AvatarUploadedDTO,
} from "@destaworks/contracts/validation/user-preferences";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { userPreferencesService } from "@destaworks/application/user-preferences.service";

/** Response body of `POST /api/me/avatar` — the public URL of the stored avatar. */
export type PostMeAvatarResponse = AvatarUploadedDTO;

/**
 * POST /api/me/avatar (Wave 6) — uploads a client-resized avatar image to Storage and returns its
 * public URL. `requireUser()`, own-record only (no id param — always "me", same posture as
 * `/api/me/preferences`). The caller still writes the returned URL onto `User.image` itself via
 * Better Auth's client-side `updateUser`.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = uploadAvatarSchema.parse(await req.json());
  return json<PostMeAvatarResponse>(await userPreferencesService.uploadAvatar(user, input));
});
