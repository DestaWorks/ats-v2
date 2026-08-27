import { postPortalRoleSchema } from "@destaworks/contracts/validation/portal";
import { requirePortalContact } from "@destaworks/auth/portal-guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { clientPortalService } from "@destaworks/application/client-portal.service";

/** Response body of `POST /api/portal/roles` — the new role's id only, nothing else. */
export type PostPortalRoleResponse = { role: { id: string } };

/**
 * POST /api/portal/roles — a client posts a new open role. Identity comes ONLY from
 * `requirePortalContact()` (the verified cookie) — `clientId`/`postedByContactId` are always
 * server-set from that, never from the request body (the fix for legacy's IDOR).
 */
export const POST = apiHandler(async (req: Request) => {
  const ctx = await requirePortalContact();
  const input = postPortalRoleSchema.parse(await req.json());
  const role = await clientPortalService.postRole(ctx, input);
  return json<PostPortalRoleResponse>({ role }, 201);
});
