import type { LearnProgressDTO } from "@destaworks/contracts/validation/learn";
import type { AuthUser } from "@destaworks/auth/guards";
import { userRepository } from "@destaworks/db/repositories/user.repository";

/**
 * Learn tutorial progress (Wave 5.4) — own-record only, same shape as `userPreferencesService`.
 * Not audited (personal UI state, matches legacy which never tracked it server-side at all).
 */
export const learnService = {
  async getMine(user: AuthUser): Promise<LearnProgressDTO> {
    return userRepository.getLearnProgress(user.id);
  },

  async setChapter(user: AuthUser, chapterId: string, done: boolean): Promise<LearnProgressDTO> {
    return userRepository.setChapterProgress(user.id, chapterId, done);
  },
};
