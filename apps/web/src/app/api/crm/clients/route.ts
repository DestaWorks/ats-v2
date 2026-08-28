import { createClientSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `GET /api/crm/clients`. */
export type GetCrmClientsResponse = Contract.GetCrmClientsResponse;

/** Wire shape of `POST /api/crm/clients`. */
export type PostCrmClientResponse = Contract.PostCrmClientResponse;

/**
 * GET /api/crm/clients — the full client list (small, fixed set — no pagination, matches
 * `clientRepository.list()`'s existing contract). POST adds a client. Both gated behind
 * `requireCapability("viewCrm")` — legacy gates the entire CRM view to leadership
 * (`index.html:1415`) and contact mutations to leadership/BD server-side (`Code.gs:151`).
 */
export const GET = apiHandler(async () => {
  await requireCapability("viewCrm");
  return json<GetCrmClientsResponse>(await clientService.list());
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requireCapability("viewCrm");
  const input = createClientSchema.parse(await req.json());
  const client = await clientService.create(input, user);
  return json<PostCrmClientResponse>({ client }, 201);
});
