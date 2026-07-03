import { apiHandler, json } from "@/server/http/api-handler";
import { requireUser } from "@/server/auth/guards";

/**
 * GET /api/me — the current authenticated user. Proves the end-to-end guarded path:
 * `requireUser()` throws `AppError("UNAUTHORIZED")` when signed out, which `apiHandler`
 * maps to a 401 JSON envelope automatically.
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json({ id: user.id, email: user.email, name: user.name, role: user.role });
});
