import type { APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Fixture-only: an admin-created account with a known plaintext password (`POST /admin/users`),
 * for specs that need a second account already in the acting workspace — `admin-user.service.ts`
 * creates the account AND an active membership in the caller's tenant in one act. Rides the Owner
 * session already in `request`'s context — `manageUsers` is Owner/Admin-only.
 */
export async function createUser(
  request: APIRequestContext,
  name: string,
  email: string,
  role: string,
  password: string,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/admin/users`, {
    data: { name, email, role, password },
  });
  if (!response.ok()) {
    throw new Error(`Failed to create fixture user: ${response.status()} ${await response.text()}`);
  }
}
