import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { requireUser } from "@destaworks/auth/guards";
import type { SessionUserDTO } from "@destaworks/contracts/validation/auth";

/** Response body of `GET /api/me`. */
export type GetMeResponse = SessionUserDTO;

/**
 * GET /api/me — the current authenticated user. Proves the end-to-end guarded path:
 * `requireUser()` throws `AppError("UNAUTHORIZED")` when signed out, which `apiHandler`
 * maps to a 401 JSON envelope automatically.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json<GetMeResponse>({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
});
