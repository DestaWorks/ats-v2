import { createClientNoteSchema } from "@/lib/validation/client-note";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientNoteService } from "@/server/services/client-note.service";

/** GET/POST /api/crm/clients/:id/notes — manual call/note log. Gated `viewCrm`. */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const notes = await clientNoteService.list(id);
  return json({ notes });
});

export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = createClientNoteSchema.parse(await req.json());
  const note = await clientNoteService.create(id, input, user);
  return json({ note }, 201);
});
