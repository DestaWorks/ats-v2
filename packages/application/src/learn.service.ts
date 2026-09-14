import type { LearnProgressDTO } from "@destaworks/contracts/validation/learn";
import type { TenantContext } from "@destaworks/domain/tenant";
import { userRepository } from "@destaworks/db/repositories/user.repository";

/**
 * Learn tutorial progress (Wave 5.4) — own-record only, same shape as `userPreferencesService`.
 * Not audited (personal UI state, matches legacy which never tracked it server-side at all).
 */
export const learnService = {
  async getMine(ctx: TenantContext): Promise<LearnProgressDTO> {
    return userRepository.getLearnProgress(ctx.user.id);
  },

  async setChapter(
    ctx: TenantContext,
    chapterId: string,
    done: boolean,
  ): Promise<LearnProgressDTO> {
    return userRepository.setChapterProgress(ctx.user.id, chapterId, done);
  },
};
