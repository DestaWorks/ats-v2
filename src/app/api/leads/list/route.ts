import { leadListQuerySchema, type LeadListDTO } from "@/lib/validation/lead";
import { defined } from "@/lib/utils/defined";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { leadService } from "@/server/services/lead.service";

/** Response body of `GET /api/leads/list`. */
export type GetLeadListResponse = LeadListDTO;

/**
 * GET /api/leads/list — one server OFFSET page of the `/sourcing` inventory (the RSC renders the
 * page directly; this route exists for programmatic reads). Guarded by `requireUser()` (L-7).
 * Filters (status/source/clientId/ownerId/search/deleted) + a 1-based `page` (clamped
 * server-side). Returns the `LeadListDTO` page.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const { deleted, ...filters } = leadListQuerySchema.parse({
    status: params.get("status") ?? undefined,
    source: params.get("source") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    ownerId: params.get("ownerId") ?? undefined,
    search: params.get("search") ?? undefined,
    deleted: params.get("deleted") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  return json<GetLeadListResponse>(
    await leadService.list(defined({ ...filters, includeDeleted: deleted })),
  );
});
