import { leadListQuerySchema } from "@/lib/validation/lead";
import { decodeCursor } from "@/lib/validation/cursor";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { AppError } from "@/server/http/app-error";
import { leadService } from "@/server/services/lead.service";

/**
 * GET /api/leads/list — the `/sourcing` inventory's LOAD-MORE endpoint. The RSC renders the FIRST
 * page directly (SSR, no fetch flash) via `leadService.list`; this route serves subsequent keyset
 * pages. Guarded by `requireUser()` (L-7). Filters (status/source/search) + an opaque keyset `cursor`
 * (Newest-first; malformed → 400). Returns the `LeadListDTO` page (`leads`/`nextCursor`/`hasMore`/`total`).
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const { cursor, ...filters } = leadListQuerySchema.parse({
    status: params.get("status") ?? undefined,
    source: params.get("source") ?? undefined,
    search: params.get("search") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });

  let decoded;
  if (cursor) {
    decoded = decodeCursor(cursor, "createdAt_desc");
    if (!decoded) throw new AppError("BAD_REQUEST", "Invalid cursor");
  }

  const list = await leadService.list({ ...filters, cursor: decoded });
  return json(list);
});
