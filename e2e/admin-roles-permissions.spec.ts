import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { createUser } from "./fixtures/api";
import { gotoReady } from "./fixtures/navigate";

/**
 * Roles tab (`apps/web/src/app/(app)/admin/roles-tab.tsx`) — role membership cards and the
 * read-only permission matrix, driven entirely by `ROLE_CAPABILITIES`
 * (`packages/domain/src/constants/roles.ts`). Neither surface has any prior E2E coverage;
 * `admin-user.spec.ts`/`admin-access-blocked.spec.ts` only cover the Users tab and console gating.
 *
 * Assertions are anchored to the actual capability table rather than the exact seeded user count,
 * since other specs create fixture accounts and this suite doesn't reset the database between runs.
 */
test("shows role membership counts and the permission matrix", async ({ page }) => {
  await gotoReady(page, "/admin");
  await page.getByRole("button", { name: /\d+ Roles$/ }).click();

  await expect(page.getByRole("heading", { name: "Role Management" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Permission Matrix" })).toBeVisible();

  // The seeded Owner always has at least one member in the Owner role card.
  const ownerCard = page
    .locator('div[style*="border-left"]')
    .filter({ has: page.getByText("Owner", { exact: true }) });
  await expect(ownerCard).toBeVisible();
  await expect(ownerCard.getByText(/\d+ users?/)).toBeVisible();

  // Columns come from the workspace's OWN `access_roles` rows, so their order is whatever the
  // API returns — resolve each role's column by its header rather than pinning an index.
  const grant = async (capability: string, role: string) => {
    const headers = page.locator("thead th");
    const names = await headers.allTextContents();
    const column = names.findIndex((name) => name.trim() === role);
    expect(column, `no column headed "${role}"`).toBeGreaterThan(0);
    return page.getByRole("row", { name: capability }).locator("td").nth(column);
  };

  await expect(await grant("manageUsers", "Owner")).toHaveText("✓");
  await expect(await grant("manageUsers", "Admin")).toHaveText("✓");
  await expect(await grant("manageUsers", "Screener")).toHaveText("—");
  await expect(await grant("manageUsers", "Associate")).toHaveText("—");

  await expect(await grant("viewReports", "Director")).toHaveText("✓");
  await expect(await grant("viewReports", "Manager")).toHaveText("✓");
  await expect(await grant("viewReports", "Screener")).toHaveText("—");
  await expect(await grant("viewReports", "Associate")).toHaveText("—");
});

const ROLES_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";
const ROLES_WEB_BASE = "http://localhost:3007";

async function rolesInWorkspace(
  request: APIRequestContext,
): Promise<{ id: string; name: string; capabilities: string[] }[]> {
  const response = await request.get(`${ROLES_API_BASE}/tenants/roles`);
  expect(response.ok()).toBeTruthy();
  const { roles } = (await response.json()) as {
    roles: { id: string; name: string; capabilities: string[] }[];
  };
  return roles;
}

test("refuses an edit that would leave the workspace with nobody who can manage it", async ({
  request,
}) => {
  const owner = (await rolesInWorkspace(request)).find((role) => role.name === "Owner");
  expect(owner, "the seeded workspace has an Owner role").toBeDefined();

  const stripped = owner!.capabilities.filter((capability) => capability !== "manageUsers");
  const response = await request.patch(`${ROLES_API_BASE}/tenants/roles/${owner!.id}`, {
    data: { name: owner!.name, capabilities: stripped },
  });

  expect(response.status()).toBe(409);

  const after = (await rolesInWorkspace(request)).find((role) => role.id === owner!.id);
  expect(after?.capabilities, "the refusal left the Owner role untouched").toContain("manageUsers");
});

test("refuses a role granting access the editor does not hold", async ({ request, browser }) => {
  const stamp = Date.now();
  const limited = await request.post(`${ROLES_API_BASE}/tenants/roles`, {
    data: { name: `E2E Limited ${stamp}`, capabilities: ["manageRoles"] },
  });
  expect(limited.ok()).toBeTruthy();

  const email = `e2e-limited-${stamp}@example.com`;
  const password = "E2eLimited123!";
  const created = await request.post(`${ROLES_API_BASE}/admin/users`, {
    data: {
      name: `E2E Limited ${stamp}`,
      email,
      roleId: ((await limited.json()) as { role: { id: string } }).role.id,
      password,
    },
  });
  expect(created.ok()).toBeTruthy();

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const signIn = await context.request.post(`${ROLES_WEB_BASE}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { origin: ROLES_WEB_BASE },
  });
  expect(signIn.ok()).toBeTruthy();
  await context.request.post(`${ROLES_API_BASE}/tenants/switch`, {
    data: { tenant: "destaworks" },
  });

  const escalation = await context.request.post(`${ROLES_API_BASE}/tenants/roles`, {
    data: { name: `E2E Escalated ${stamp}`, capabilities: ["manageRoles", "viewCredentials"] },
  });
  expect(escalation.status()).toBe(403);

  await context.close();
});

test("refuses a role granting a permission that does not exist", async ({ request }) => {
  const response = await request.post(`${ROLES_API_BASE}/tenants/roles`, {
    data: { name: `E2E Unknown ${Date.now()}`, capabilities: ["notARealCapability"] },
  });

  expect(response.status()).toBe(400);
});

test("deletes a custom workspace role but refuses to delete a built-in one", async ({
  request,
}) => {
  const created = await request.post(`${ROLES_API_BASE}/tenants/roles`, {
    data: { name: `E2E Disposable ${Date.now()}`, capabilities: ["viewCrm"] },
  });
  expect(created.ok()).toBeTruthy();
  const { role } = (await created.json()) as { role: { id: string } };

  const deleted = await request.delete(`${ROLES_API_BASE}/tenants/roles/${role.id}`);
  expect(deleted.ok()).toBeTruthy();
  expect((await rolesInWorkspace(request)).map((r) => r.id)).not.toContain(role.id);

  const builtIn = (await rolesInWorkspace(request)).find((r) => r.name === "Screener");
  expect(builtIn, "the workspace has a built-in Screener role").toBeDefined();
  const refused = await request.delete(`${ROLES_API_BASE}/tenants/roles/${builtIn!.id}`);
  expect(refused.status()).toBe(409);
});

test("changes a member's role in the workspace roster", async ({ request }) => {
  const stamp = Date.now();
  const email = `e2e-role-change-${stamp}@example.com`;
  await createUser(request, `E2E Role Change ${stamp}`, email, "Associate", "E2eRoleChange123!");

  const roster = await request.get(`${ROLES_API_BASE}/tenants/members`);
  const { members } = (await roster.json()) as {
    members: { membershipId: string; email: string; role: string }[];
  };
  const membership = members.find((member) => member.email === email);
  expect(membership, `no membership for ${email}`).toBeDefined();

  const screener = (await rolesInWorkspace(request)).find((r) => r.name === "Screener");
  const changed = await request.patch(
    `${ROLES_API_BASE}/tenants/members/${membership!.membershipId}/role`,
    { data: { roleId: screener!.id } },
  );
  expect(changed.ok()).toBeTruthy();

  const after = await request.get(`${ROLES_API_BASE}/tenants/members`);
  const { members: updated } = (await after.json()) as {
    members: { email: string; role: string }[];
  };
  expect(updated.find((m) => m.email === email)?.role).toBe("Screener");
});
