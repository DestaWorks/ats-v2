import { activityQuerySchema } from "@destaworks/contracts/validation/activity";
import { decodeCursor } from "@destaworks/contracts/validation/cursor";
import { defined } from "@destaworks/domain/utils/defined";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { AppError } from "@destaworks/integrations/http/app-error";
import { auditService } from "@destaworks/application/audit.service";
import type { ActivityListDTO } from "@destaworks/contracts/validation/activity";

/** Wire shape of `GET /api/activity` — one keyset page of the Activity Log (no raw snapshots). */
export type GetActivityResponse = ActivityListDTO;

/**
 * GET /api/activity — the Activity Log's LOAD-MORE endpoint (Wave 2.5). The `/activity` RSC renders
 * the FIRST page directly (SSR, no fetch flash) via `auditService.listActivity`; this route serves
 * subsequent keyset pages.
 *
 * Guarded by `requireCapability("viewAudit")` at the route for defense-in-depth — the service ALSO
 * self-gates on `viewAudit` (server-authoritative, AL-6). Query: `action`/`entity`/`actor` (equality
 * filters), `from`/`to` (a `YYYY-MM-DD` date range widened to UTC day-bounds in the service), and an
 * opaque keyset `cursor` (malformed → 400). Returns the `ActivityListDTO` page. NO raw `before`/
 * `after` — the list carries only `hasChanges` (AL-3); snapshots load via `/api/activity/[id]`.
 */
export const GET = apiHandler(async (req: Request) => {
  await requireCapability("viewAudit");
  const params = new URL(req.url).searchParams;
  const { cursor, ...filters } = activityQuerySchema.parse({
    action: params.get("action") ?? undefined,
    entity: params.get("entity") ?? undefined,
    actor: params.get("actor") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });

  let decoded = null;
  if (cursor) {
    decoded = decodeCursor(cursor, "at_desc");
    if (!decoded) throw new AppError("BAD_REQUEST", "Invalid cursor");
  }

  const list = await auditService.listActivity(defined(filters), decoded);
  return json<GetActivityResponse>(list);
});
