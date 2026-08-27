import "server-only";
import type { CreateSavedIcpInput, SavedIcpDTO } from "@destaworks/contracts/validation/saved-icp";
import type { AuthUser } from "@destaworks/auth/guards";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import {
  savedIcpRepository,
  type SavedIcpRow,
} from "@destaworks/db/repositories/saved-icp.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import { toIso } from "@destaworks/domain/utils/iso";

function toDTO(row: SavedIcpRow, userNames: Map<string, string>): SavedIcpDTO {
  return {
    id: row.id,
    name: row.name,
    taxonomy: row.taxonomy,
    state: row.state,
    city: row.city,
    zip: row.zip,
    isPrivate: row.isPrivate,
    userId: row.userId,
    userName: userNames.get(row.userId) ?? null,
    createdAt: toIso(row.createdAt),
  };
}

/**
 * Client Discovery saved searches ("ICPs") — mirrors `savedViewService` exactly, except
 * visibility is team-shared by default (only `isPrivate` rows are owner-only), matching the
 * reference UI's "team-shared by default, private toggle" behavior. `requireCapability
 * ("viewClientDiscovery")` at the route layer is the real gate; ownership here only governs
 * WHO can delete/see a private ICP, not whether Client Discovery itself is reachable.
 */
export const savedIcpService = {
  /** Every ICP visible to the caller: all shared (`!isPrivate`) ICPs + the caller's own private ones. */
  async list(user: AuthUser): Promise<SavedIcpDTO[]> {
    const rows = await savedIcpRepository.listAll();
    const visible = rows.filter((r) => !r.isPrivate || r.userId === user.id);
    const userNames = await userRepository.namesByIds([...new Set(visible.map((r) => r.userId))]);
    return visible.map((r) => toDTO(r, userNames));
  },

  async create(input: CreateSavedIcpInput, user: AuthUser): Promise<SavedIcpDTO> {
    const existing = await savedIcpRepository.findByUserAndName(user.id, input.name);
    if (existing) {
      throw new AppError("CONFLICT", `You already have an ICP named "${input.name}"`);
    }

    const row = await withTransaction(async (tx) => {
      const created = await savedIcpRepository.create(
        {
          userId: user.id,
          name: input.name,
          taxonomy: input.taxonomy ?? null,
          state: input.state ?? null,
          city: input.city ?? null,
          zip: input.zip ?? null,
          isPrivate: input.isPrivate ?? false,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "saved_icp",
        entityId: created.id,
        actor: user.id,
        action: "create",
        after: { name: created.name, isPrivate: created.isPrivate },
      });
      return created;
    });
    const userNames = await userRepository.namesByIds([user.id]);
    return toDTO(row, userNames);
  },

  /** NOT_FOUND (not FORBIDDEN) whether the id doesn't exist or belongs to another user —
   *  deliberately indistinguishable, mirrors `savedViewService.remove`. */
  async remove(id: string, user: AuthUser): Promise<{ id: string }> {
    await withTransaction(async (tx) => {
      const { count } = await savedIcpRepository.deleteOwned(id, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Saved ICP not found");
      await writeAudit(tx, {
        entity: "saved_icp",
        entityId: id,
        actor: user.id,
        action: "delete",
      });
    });
    return { id };
  },
};
