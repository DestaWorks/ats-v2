import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { accessRequestService } from "@/server/services/access-request.service";

/** POST /api/admin/access-requests/:id/decline — mark a request declined. Gated `manageAccessRequests`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("manageAccessRequests");
  const { id } = await ctx.params;
  await accessRequestService.decline(id);
  return json({ ok: true, id });
});
