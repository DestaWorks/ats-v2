import "server-only";
import type { UserPreferencesDTO, UpdatePreferencesInput } from "@/lib/validation/user-preferences";
import { userRepository } from "@/server/repositories/user.repository";
import type { AuthUser } from "@/server/auth/guards";
import { AppError } from "@/server/http/app-error";

/**
 * Per-user profile preferences (Wave 4.1, Templates) — email signature + the global sticky-note
 * scratchpad. Own-record only: every method takes the SESSION user and reads/writes exactly that
 * user's row, never an id param — there's no cross-user access to gate. Not audited (personal UI
 * preferences, not a business record — matches legacy, which never tracked these at all).
 */
export const userPreferencesService = {
  async getMine(user: AuthUser): Promise<UserPreferencesDTO> {
    const row = await userRepository.findPreferences(user.id);
    if (!row) throw new AppError("NOT_FOUND", "User not found");
    return row;
  },

  async updateMine(user: AuthUser, input: UpdatePreferencesInput): Promise<UserPreferencesDTO> {
    return userRepository.updatePreferences(user.id, input);
  },
};
