import { updateClientSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/**
 * GET /api/crm/clients/:id — one client's full detail (profile + contacts + pipeline snapshot).
 * PATCH edits the profile fields (legacy's "Client Info" tab). Both gated `viewCrm`.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("viewCrm");
  const { id } = await ctx.params;
  return json(await clientService.detail(id));
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = updateClientSchema.parse(await req.json());
  const client = await clientService.update(id, input, user);
  return json({ client });
});
