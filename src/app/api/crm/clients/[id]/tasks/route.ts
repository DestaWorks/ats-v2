import { addTaskSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/** POST /api/crm/clients/:id/tasks — add a follow-up task for this client. Gated `viewCrm`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id } = await ctx.params;
  const input = addTaskSchema.parse(await req.json());
  const task = await clientService.addTask(id, input, user);
  return json({ task }, 201);
});
