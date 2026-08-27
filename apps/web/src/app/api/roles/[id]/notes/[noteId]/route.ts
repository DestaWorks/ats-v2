import type { OpenRoleDetailDTO } from "@destaworks/contracts/validation/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `DELETE /api/roles/:id/notes/:noteId` — the fresh role detail. */
export type DeleteRoleNoteResponse = { role: OpenRoleDetailDTO };

/** DELETE /api/roles/:id/notes/:noteId — soft-delete one role note. 404 if not found under this role. */
export const DELETE = apiHandler<{ params: Promise<{ id: string; noteId: string }> }>(
  async (_req, ctx) => {
    const user = await requireUser();
    const { id, noteId } = await ctx.params;
    return json<DeleteRoleNoteResponse>({
      role: await openRoleService.deleteNote(id, noteId, user),
    });
  },
);
