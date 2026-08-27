import { addRoleNoteSchema, type OpenRoleDetailDTO } from "@/lib/validation/open-role";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/** Response body of `POST /api/roles/:id/notes` — the whole role detail, notes included. */
export type PostRoleNoteResponse = { role: OpenRoleDetailDTO };

/** POST /api/roles/:id/notes — add a role note. `authorId`/`authorName` come from the session. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = addRoleNoteSchema.parse(await req.json());
  return json<PostRoleNoteResponse>({ role: await openRoleService.addNote(id, input, user) }, 201);
});
