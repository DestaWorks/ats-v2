import { listQuerySchema } from "@/lib/validation/pipeline";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { candidateService } from "@/server/services/candidate.service";

/**
 * GET /api/candidates/list — JSON parity for the flat `/candidates` browse list (the RSC renders the
 * same data server-side; this endpoint serves programmatic/AJAX callers). Guarded by `requireUser()`
 * — `viewer` drives the PII gate (`toCandidateDTO` omits `licenseNumber`) AND resolves `mine`
 * (`createdById === viewer.id`, never a client-supplied id).
 *
 * Everything resolves server-side: filters (track/clientId/status/search/tags/licenseStatus/mine/
 * overdue/stuck), the `hot` score filter, a `sort` (newest/oldest/fit), and `page` (1-based OFFSET).
 * Returns the offset `CandidateListDTO` (`candidates`/`total`/`page`/`pageSize`/`totalPages`/…).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const query = listQuerySchema.parse({
    status: params.get("status") ?? undefined,
    track: params.get("track") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    search: params.get("search") ?? undefined,
    tags: params.get("tags") ?? undefined,
    licenseStatus: params.get("licenseStatus") ?? undefined,
    source: params.get("source") ?? undefined,
    ownerId: params.get("ownerId") ?? undefined,
    addedFrom: params.get("addedFrom") ?? undefined,
    addedTo: params.get("addedTo") ?? undefined,
    mine: params.get("mine") ?? undefined,
    overdue: params.get("overdue") ?? undefined,
    stuck: params.get("stuck") ?? undefined,
    hot: params.get("hot") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });

  const list = await candidateService.listCandidates(query, user);
  return json(list);
});
