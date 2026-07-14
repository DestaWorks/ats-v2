import { addRoleNoteSchema } from "@/lib/validation/open-role";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/** POST /api/roles/:id/notes — add a role note. `authorId`/`authorName` come from the session. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = addRoleNoteSchema.parse(await req.json());
  return json({ role: await openRoleService.addNote(id, input, user) }, 201);
});
