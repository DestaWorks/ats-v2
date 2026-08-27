import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { accessRequestService } from "@/server/services/access-request.service";

/** Response body of `POST /api/admin/access-requests/:id/decline` — the id that was declined. */
export type PostAdminAccessRequestDeclineResponse = { ok: true; id: string };

/** POST /api/admin/access-requests/:id/decline — mark a request declined. Gated `manageAccessRequests`. */
export const POST = apiHandler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await requireCapability("manageAccessRequests");
  const { id } = await ctx.params;
  await accessRequestService.decline(id);
  return json<PostAdminAccessRequestDeclineResponse>({ ok: true, id });
});
