import { uploadAvatarSchema } from "@/lib/validation/user-preferences";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { userPreferencesService } from "@/server/services/user-preferences.service";

/**
 * POST /api/me/avatar (Wave 6) — uploads a client-resized avatar image to Storage and returns its
 * public URL. `requireUser()`, own-record only (no id param — always "me", same posture as
 * `/api/me/preferences`). The caller still writes the returned URL onto `User.image` itself via
 * Better Auth's client-side `updateUser`.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = uploadAvatarSchema.parse(await req.json());
  return json(await userPreferencesService.uploadAvatar(user, input));
});
