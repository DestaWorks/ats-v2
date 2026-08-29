import { updateClientSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `GET /api/crm/clients/:id`. */
export type GetCrmClientResponse = Contract.GetCrmClientResponse;

/** Wire shape of `PATCH /api/crm/clients/:id`. */
export type PatchCrmClientResponse = Contract.PatchCrmClientResponse;

/**
 * GET /api/crm/clients/:id — one client's full detail (profile + contacts + pipeline snapshot).
 * PATCH edits the profile fields (legacy's "Client Info" tab). Both gated `viewCrm`.
 */
export const GET = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  return json<GetCrmClientResponse>(await clientService.detail(id, user));
});

export const PATCH = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = updateClientSchema.parse(await req.json());
  const client = await clientService.update(id, input, user);
  return json<PatchCrmClientResponse>({ client });
});
