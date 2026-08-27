import {
  createUserSchema,
  type AdminUserListDTO,
  type GeneratedPasswordDTO,
} from "@destaworks/contracts/validation/admin";
import { requireCapability } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { adminUserService } from "@destaworks/application/admin-user.service";

/** Response body of `GET /api/admin/users`. */
export type GetAdminUsersResponse = AdminUserListDTO;

/** Response body of `POST /api/admin/users` (201) — the one-time generated password. */
export type PostAdminUserResponse = GeneratedPasswordDTO;

/**
 * GET /api/admin/users — list every account (Better Auth's admin plugin owns storage; this route
 * just gates it behind our own capability model). POST creates a new account directly (Wave 5.3
 * decision: no `Invite` model — `auth.api.createUser` already does hashed-password account
 * creation with no plaintext-storage step, unlike legacy). Both gated `manageUsers`.
 */
export const GET = apiHandler(async () => {
  await requireCapability("manageUsers");
  return json<GetAdminUsersResponse>(await adminUserService.list());
});

export const POST = apiHandler(async (req: Request) => {
  const actor = await requireCapability("manageUsers");
  const input = createUserSchema.parse(await req.json());
  const result = await adminUserService.create(input, actor.id);
  return json<PostAdminUserResponse>(result, 201);
});
