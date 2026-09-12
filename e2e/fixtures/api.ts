import type { APIRequestContext } from "@playwright/test";

const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

interface RoleRow {
  id: string;
  name: string;
}

/**
 * Resolve a role NAME to the acting workspace's own role row id.
 *
 * Roles became tenant-owned rows, so `POST /admin/users` names a `roleId` rather than a value from
 * a fixed enum — a workspace may rename its tiers or invent new ones, which makes a name an
 * unstable identifier. Specs still say "Associate" because that is what they mean; the lookup is
 * what turns it into this workspace's id.
 */
async function roleIdFor(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get(`${API_BASE_URL}/tenants/roles`);
  if (!response.ok()) {
    throw new Error(
      `Failed to read workspace roles: ${response.status()} ${await response.text()}`,
    );
  }
  const { roles } = (await response.json()) as { roles: RoleRow[] };
  const match = roles.find((role) => role.name === name);
  if (match === undefined) {
    throw new Error(
      `No role named "${name}" in this workspace (have: ${roles.map((r) => r.name).join(", ")})`,
    );
  }
  return match.id;
}

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
  const roleId = await roleIdFor(request, role);
  const response = await request.post(`${API_BASE_URL}/admin/users`, {
    data: { name, email, roleId, password },
  });
  if (!response.ok()) {
    throw new Error(`Failed to create fixture user: ${response.status()} ${await response.text()}`);
  }
}
