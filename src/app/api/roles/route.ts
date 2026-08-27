import {
  createOpenRoleSchema,
  roleListQuerySchema,
  type OpenRoleDetailDTO,
  type OpenRoleListDTO,
} from "@/lib/validation/open-role";
import { defined } from "@/lib/utils/defined";
import { requireUser } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { openRoleService } from "@/server/services/open-role.service";

/** Response body of `POST /api/roles`. */
export type PostRoleResponse = { role: OpenRoleDetailDTO };

/** Response body of `GET /api/roles`. */
export type GetRoleListResponse = OpenRoleListDTO;

/**
 * POST /api/roles — add an Open Role (Wave 3.5). Guarded by `requireUser()` (open to any signed-in
 * operator, L-7, matches candidates/leads). `createOpenRoleSchema.strict()`; `status` is never
 * accepted here — a create always starts at "Open". Returns the created role's detail with a 201.
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const input = createOpenRoleSchema.parse(await req.json());
  const role = await openRoleService.create(input, user);
  return json<PostRoleResponse>({ role }, 201);
});

/**
 * GET /api/roles — one server OFFSET page of the role inventory. Filters: clientId/status/
 * priority/search + a 1-based `page` (clamped server-side).
 */
export const GET = apiHandler(async (req: Request) => {
  await requireUser();
  const params = new URL(req.url).searchParams;
  const filters = roleListQuerySchema.parse({
    clientId: params.get("clientId") ?? undefined,
    status: params.get("status") ?? undefined,
    priority: params.get("priority") ?? undefined,
    search: params.get("search") ?? undefined,
    page: params.get("page") ?? undefined,
  });
  return json<GetRoleListResponse>(await openRoleService.list(defined(filters)));
});
