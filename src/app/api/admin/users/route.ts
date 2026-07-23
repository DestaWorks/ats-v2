import { createUserSchema } from "@/lib/validation/admin";
import { requireCapability } from "@/server/auth/guards";
import { apiHandler, json } from "@/server/http/api-handler";
import { adminUserService } from "@/server/services/admin-user.service";

/**
 * GET /api/admin/users — list every account (Better Auth's admin plugin owns storage; this route
 * just gates it behind our own capability model). POST creates a new account directly (Wave 5.3
 * decision: no `Invite` model — `auth.api.createUser` already does hashed-password account
 * creation with no plaintext-storage step, unlike legacy). Both gated `manageUsers`.
 */
export const GET = apiHandler(async () => {
  await requireCapability("manageUsers");
  return json(await adminUserService.list());
});

export const POST = apiHandler(async (req: Request) => {
  await requireCapability("manageUsers");
  const input = createUserSchema.parse(await req.json());
  const result = await adminUserService.create(input);
  return json(result, 201);
});
