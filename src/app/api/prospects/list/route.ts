import { prospectListQuerySchema } from "@/lib/validation/prospect";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { prospectService } from "@/server/services/prospect.service";

/**
 * GET /api/prospects/list — one server OFFSET page of the `/client-discovery` inventory (the RSC
 * renders page 1 directly; this route exists for programmatic reads/filter changes). Leadership
 * -gated (`viewClientDiscovery`). Filters (status/ownerId/source/search/deleted) + a 1-based
 * `page` (clamped server-side).
 */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewClientDiscovery");
  const params = new URL(req.url).searchParams;
  const { deleted, ...filters } = prospectListQuerySchema.parse({
    status: params.get("status") ?? undefined,
    ownerId: params.get("ownerId") ?? undefined,
    source: params.get("source") ?? undefined,
    search: params.get("search") ?? undefined,
    deleted: params.get("deleted") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  return json(await prospectService.list({ ...filters, includeDeleted: deleted }));
});
