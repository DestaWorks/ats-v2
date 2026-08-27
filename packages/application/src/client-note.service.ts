import "server-only";
import type {
  ClientNoteDTO,
  CreateClientNoteInput,
} from "@destaworks/contracts/validation/client-note";
import { toIso } from "@destaworks/domain/utils/iso";
import type { AuthUser } from "@destaworks/auth/guards";
import { writeAudit } from "@destaworks/db/audit";
import { withTransaction } from "@destaworks/db/with-transaction";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import {
  clientNoteRepository,
  type ClientNoteRow,
} from "@destaworks/db/repositories/client-note.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { AppError } from "@destaworks/integrations/http/app-error";

/** Exported for reuse by `client.service.ts`'s `detail()`/timeline read — one mapper, not two. */
export function toClientNoteDTO(row: ClientNoteRow, userNames: Map<string, string>): ClientNoteDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    text: row.text,
    loggedById: row.loggedById,
    loggedByName: row.loggedById ? (userNames.get(row.loggedById) ?? null) : null,
    createdAt: toIso(row.createdAt),
  };
}

async function requireClient(id: string) {
  const client = await clientRepository.findById(id);
  if (!client) throw new AppError("NOT_FOUND", "Client not found");
  return client;
}

/**
 * Client-note service (Wave 4.2, Health Score slice, CRM) — a manual call/note log entry
 * (legacy `crm_note`). Same `requireClient → withTransaction → repo → writeAudit` shape as every
 * other client sub-resource in `client.service.ts`; kept as its own file since it's a genuinely
 * separate concern (not another tab-CRUD slice of the same feature).
 */
export const clientNoteService = {
  async list(clientId: string): Promise<ClientNoteDTO[]> {
    await requireClient(clientId);
    const rows = await clientNoteRepository.listForClient(clientId);
    const userNames = await userRepository.namesByIds(
      rows.map((r) => r.loggedById).filter((id): id is string => id != null),
    );
    return rows.map((r) => toClientNoteDTO(r, userNames));
  },

  async create(
    clientId: string,
    input: CreateClientNoteInput,
    user: AuthUser,
  ): Promise<ClientNoteDTO> {
    await requireClient(clientId);
    const created = await withTransaction(async (tx) => {
      const row = await clientNoteRepository.create(
        { ...input, clientId, loggedById: user.id },
        tx,
      );
      await writeAudit(tx, {
        entity: "client_note",
        entityId: row.id,
        actor: user.id,
        action: "add_note",
        after: { clientId },
      });
      return row;
    });
    const userNames = await userRepository.namesByIds([user.id]);
    return toClientNoteDTO(created, userNames);
  },

  async remove(clientId: string, noteId: string, user: AuthUser): Promise<void> {
    await requireClient(clientId);
    await withTransaction(async (tx) => {
      const count = await clientNoteRepository.softDelete(clientId, noteId, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Note not found");
      await writeAudit(tx, {
        entity: "client_note",
        entityId: noteId,
        actor: user.id,
        action: "remove_note",
        after: { clientId },
      });
    });
  },
};
