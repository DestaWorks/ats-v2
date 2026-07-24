import { postPortalRoleSchema } from "@/lib/validation/portal";
import { requirePortalContact } from "@/server/auth/portal-guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { clientPortalService } from "@/server/services/client-portal.service";

/**
 * POST /api/portal/roles — a client posts a new open role. Identity comes ONLY from
 * `requirePortalContact()` (the verified cookie) — `clientId`/`postedByContactId` are always
 * server-set from that, never from the request body (the fix for legacy's IDOR).
 */
export const POST = apiHandler(async (req: Request) => {
  const ctx = await requirePortalContact();
  const input = postPortalRoleSchema.parse(await req.json());
  const role = await clientPortalService.postRole(ctx, input);
  return json({ role }, 201);
});
