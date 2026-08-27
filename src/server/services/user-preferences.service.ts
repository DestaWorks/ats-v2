import "server-only";
import type {
  UserPreferencesDTO,
  UpdatePreferencesInput,
  UploadAvatarInput,
} from "@/lib/validation/user-preferences";
import { defined } from "@/lib/utils/defined";
import { userRepository } from "@/server/repositories/user.repository";
import type { AuthUser } from "@/server/auth/guards";
import { AppError } from "@/server/http/app-error";
import { AVATAR_BUCKET, uploadPublic } from "@/server/integrations/storage";

/** `data:<mime>;base64,<payload>` — the shape `resizeToDataUrl` (profile-view.tsx) always
 *  produces (JPEG). Mime is restricted to raster types with no active-content risk — an avatar
 *  has no legitimate reason to be an SVG, which can embed a `<script>`. */
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;

/**
 * Per-user profile preferences (Wave 4.1 Templates + Wave 5.4 My Profile) — email signature,
 * sticky-note scratchpad, and bio/phone/location. Own-record only: every method takes the
 * SESSION user and reads/writes exactly that user's row, never an id param — there's no
 * cross-user access to gate. Not audited (personal UI preferences, not a business record —
 * matches legacy, which never tracked these at all).
 */
export const userPreferencesService = {
  async getMine(user: AuthUser): Promise<UserPreferencesDTO> {
    const row = await userRepository.findPreferences(user.id);
    if (!row) throw new AppError("NOT_FOUND", "User not found");
    return row;
  },

  async updateMine(user: AuthUser, input: UpdatePreferencesInput): Promise<UserPreferencesDTO> {
    return userRepository.updatePreferences(user.id, defined(input));
  },

  /**
   * Upload a resized avatar image to Storage (Wave 6, D8) and return its permanent public URL —
   * the caller still writes it onto `User.image` itself via Better Auth's own `updateUser`
   * (that's a client-side call this server-only service can't make). One object per user
   * (`{userId}.jpg`, upserted), so a re-upload replaces the old file rather than accumulating.
   */
  async uploadAvatar(user: AuthUser, input: UploadAvatarInput): Promise<{ url: string }> {
    const match = DATA_URL_RE.exec(input.dataUrl);
    if (!match) throw new AppError("BAD_REQUEST", "Invalid image data");
    const [, contentType, base64] = match;
    const bytes = Buffer.from(base64!, "base64");
    const url = await uploadPublic(AVATAR_BUCKET, `${user.id}.jpg`, bytes, contentType!);
    return { url };
  },
};
