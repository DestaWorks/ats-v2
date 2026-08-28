import { updateTaskSchema } from "@destaworks/contracts/validation/client";
import type * as Contract from "@destaworks/contracts/http/crm";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientService } from "@destaworks/application/client.service";

/** Wire shape of `PATCH /api/crm/clients/:id/tasks/:taskId`. */
export type PatchCrmClientTaskResponse = Contract.PatchCrmClientTaskResponse;

/** Wire shape of `DELETE /api/crm/clients/:id/tasks/:taskId`. */
export type DeleteCrmClientTaskResponse = Contract.DeleteCrmClientTaskResponse;

/**
 * PATCH /api/crm/clients/:id/tasks/:taskId — edit a task (incl. toggling `status`, which
 * stamps/clears `completedAt` server-side). DELETE soft-deletes it. Both gated `viewCrm`.
 */
export const PATCH = apiHandler<{ params: Promise<{ id: string; taskId: string }> }>(
  async (req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, taskId } = await ctx.params;
    const input = updateTaskSchema.parse(await req.json());
    const task = await clientService.updateTask(id, taskId, input, user);
    return json<PatchCrmClientTaskResponse>({ task });
  },
);

export const DELETE = apiHandler<{ params: Promise<{ id: string; taskId: string }> }>(
  async (_req, ctx) => {
    const user = await requireCapability("viewCrm");
    const { id, taskId } = await ctx.params;
    await clientService.removeTask(id, taskId, user);
    return json<DeleteCrmClientTaskResponse>({ ok: true, id: taskId });
  },
);
