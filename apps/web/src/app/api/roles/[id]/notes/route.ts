import {
  addRoleNoteSchema,
  type OpenRoleEnvelope,
} from "@destaworks/contracts/validation/open-role";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { openRoleService } from "@destaworks/application/open-role.service";

/** Response body of `POST /api/roles/:id/notes` — the whole role detail, notes included. */
export type PostRoleNoteResponse = OpenRoleEnvelope;

/** POST /api/roles/:id/notes — add a role note. `authorId`/`authorName` come from the session. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = addRoleNoteSchema.parse(await req.json());
  return json<PostRoleNoteResponse>({ role: await openRoleService.addNote(id, input, user) }, 201);
});
