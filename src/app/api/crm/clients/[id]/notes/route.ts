import { createClientNoteSchema, type ClientNoteDTO } from "@/lib/validation/client-note";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientNoteService } from "@/server/services/client-note.service";

/** Wire shape of `GET /api/crm/clients/:id/notes`. */
export type GetCrmClientNotesResponse = { notes: ClientNoteDTO[] };

/** Wire shape of `POST /api/crm/clients/:id/notes`. */
export type PostCrmClientNoteResponse = { note: ClientNoteDTO };

/** GET/POST /api/crm/clients/:id/notes — manual call/note log. Gated `viewCrm`. */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const notes = await clientNoteService.list(id);
  return json<GetCrmClientNotesResponse>({ notes });
});

export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = createClientNoteSchema.parse(await req.json());
  const note = await clientNoteService.create(id, input, user);
  return json<PostCrmClientNoteResponse>({ note }, 201);
});
