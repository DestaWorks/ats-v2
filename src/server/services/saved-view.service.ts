import "server-only";
import type { CreateSavedViewInput, SavedViewDTO } from "@/lib/validation/saved-view";
import type { SavedViewScope } from "@/lib/constants";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import {
  savedViewRepository,
  type SavedViewRow,
} from "@/server/repositories/saved-view.repository";
import { AppError } from "@/server/http/app-error";
import { toIso } from "@/lib/utils/iso";

function toDTO(row: SavedViewRow): SavedViewDTO {
  return {
    id: row.id,
    scope: row.scope as SavedViewScope,
    name: row.name,
    query: row.query,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * Personal saved-views (Wave 2.1 closeout). Open to any signed-in operator — `requireUser()`
 * only, no capability gate: authZ here is ownership-scoped, not role-scoped. Every read is
 * filtered by `userId = user.id`; delete is a compound (id, userId) match — a user structurally
 * cannot see or touch another user's views. Personal-only (no sharing), matching legacy
 * (per-user localStorage) and the DailyTarget/JournalEntry precedent.
 */
export const savedViewService = {
  async list(scope: SavedViewScope, user: AuthUser): Promise<SavedViewDTO[]> {
    const rows = await savedViewRepository.listByUser(user.id, scope);
    return rows.map(toDTO);
  },

  async create(input: CreateSavedViewInput, user: AuthUser): Promise<SavedViewDTO> {
    const query = input.query.replace(/^\?+/, "");
    const existing = await savedViewRepository.findByUserScopeName(
      user.id,
      input.scope,
      input.name,
    );
    if (existing) {
      throw new AppError("CONFLICT", `You already have a view named "${input.name}"`);
    }

    const row = await withTransaction(async (tx) => {
      const created = await savedViewRepository.create(
        { userId: user.id, scope: input.scope, name: input.name, query },
        tx,
      );
      await writeAudit(tx, {
        entity: "saved_view",
        entityId: created.id,
        actor: user.id,
        action: "create",
        after: { scope: created.scope, name: created.name },
      });
      return created;
    });
    return toDTO(row);
  },

  /** NOT_FOUND (not FORBIDDEN) whether the id doesn't exist or belongs to another user —
   *  deliberately indistinguishable, so the error can't be used to enumerate other users' ids. */
  async remove(id: string, user: AuthUser): Promise<{ id: string }> {
    await withTransaction(async (tx) => {
      const { count } = await savedViewRepository.deleteOwned(id, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Saved view not found");
      await writeAudit(tx, {
        entity: "saved_view",
        entityId: id,
        actor: user.id,
        action: "delete",
      });
    });
    return { id };
  },
};
