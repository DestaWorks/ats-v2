import { addTaskSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `POST /api/crm/clients/:id/tasks`. */
export type PostCrmClientTaskResponse = Contract.PostCrmClientTaskResponse;

/** POST /api/crm/clients/:id/tasks — add a follow-up task for this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = addTaskSchema.parse(await req.json());
  const task = await clientService.addTask(id, input, user);
  return json<PostCrmClientTaskResponse>({ task }, 201);
});
