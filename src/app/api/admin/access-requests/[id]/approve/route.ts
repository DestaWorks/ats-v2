import { approveRequestSchema } from "@/lib/validation/admin";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { accessRequestService } from "@/server/services/access-request.service";

/**
 * POST /api/admin/access-requests/:id/approve — picks a role (legacy never had this step),
 * creates the account, and flips status to `approved` — fixing legacy's confirmed no-op bug
 * where `approve_request` has no backend handler at all. Gated `manageAccessRequests`.
 */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireCapability("manageAccessRequests");
  const { id } = await ctx.params;
  const input = approveRequestSchema.parse(await req.json());
  const result = await accessRequestService.approve(id, input.role);
  return json(result);
});
