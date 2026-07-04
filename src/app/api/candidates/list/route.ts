import { listQuerySchema, listSortToOrderBy } from "@/lib/validation/pipeline";
import { decodeCursor } from "@/lib/validation/cursor";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "@/server/services/candidate.service";

/**
 * GET /api/candidates/list — the flat `/candidates` browse list's LOAD-MORE endpoint. The RSC still
 * renders the FIRST page directly (SSR, no fetch flash) via `candidateService.listCandidates`; this
 * route serves subsequent keyset pages. Guarded by `requireUser()` — `viewer` drives the PII gate
 * (`toCandidateDTO` omits `licenseNumber`) AND resolves `mine` (`createdById === viewer.id`, never a
 * client-supplied id).
 *
 * Filters mirror the board (track/clientId/status/search/tags/licenseStatus/mine/overdue/stuck) plus
 * a DB-backed `sort` (Newest/Oldest — Name A–Z deferred, OQ-4) and an opaque keyset `cursor`
 * (malformed → 400). Returns the `CandidateListDTO` cursor page (`items`/`nextCursor`/`hasMore`/`total`).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const params = new URL(req.url).searchParams;
  const { sort, cursor, ...filters } = listQuerySchema.parse({
    status: params.get("status") ?? undefined,
    track: params.get("track") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    search: params.get("search") ?? undefined,
    tags: params.get("tags") ?? undefined,
    licenseStatus: params.get("licenseStatus") ?? undefined,
    mine: params.get("mine") ?? undefined,
    overdue: params.get("overdue") ?? undefined,
    stuck: params.get("stuck") ?? undefined,
    sort: params.get("sort") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });

  const orderBy = listSortToOrderBy(sort);
  let decoded;
  if (cursor) {
    decoded = decodeCursor(cursor, orderBy);
    if (!decoded) throw new AppError("BAD_REQUEST", "Invalid cursor");
  }

  const list = await candidateService.listCandidates(
    { ...filters, sort: orderBy, cursor: decoded },
    user,
  );
  return json(list);
});
