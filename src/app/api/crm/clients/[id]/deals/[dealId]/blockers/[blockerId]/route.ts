import { updateBlockerSchema } from "@/lib/validation/client";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientService } from "@/server/services/client.service";

/**
 * PATCH /api/crm/clients/:id/deals/:dealId/blockers/:blockerId — toggle `resolved` (stamps/clears
 * `resolvedAt` server-side). DELETE removes it outright. Both gated `viewCrm`.
 */
export const PATCH = apiHandler<{
  params: Promise<{ id: string; dealId: string; blockerId: string }>;
}>(async (req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id, dealId, blockerId } = await ctx.params;
  const input = updateBlockerSchema.parse(await req.json());
  const blocker = await clientService.updateBlocker(id, dealId, blockerId, input, user);
  return json({ blocker });
});

export const DELETE = apiHandler<{
  params: Promise<{ id: string; dealId: string; blockerId: string }>;
}>(async (_req, ctx) => {
  const user = await requireCapability("viewCrm");
  const { id, dealId, blockerId } = await ctx.params;
  await clientService.removeBlocker(id, dealId, blockerId, user);
  return json({ ok: true, id: blockerId });
});
