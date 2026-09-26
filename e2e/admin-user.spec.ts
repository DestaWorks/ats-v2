import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Admin — add a user (`apps/web/src/app/(app)/admin/users-tab.tsx`). Password is left blank
 * (the form auto-generates one); the modal closes and the new row lands in the table on success.
 */
test("adds a user from the admin panel", async ({ page }) => {
  const email = `e2e-user-${Date.now()}@example.com`;

  await gotoReady(page, "/admin");
  await page.getByRole("button", { name: "+ Add User" }).click();
  await page.getByLabel(/^Name\*?$/).fill(`E2E User ${Date.now()}`);
  await page.getByLabel(/^Email\*?$/).fill(email);
  await page.getByRole("button", { name: "Add User", exact: true }).click();

  await expect(page.getByText(email).first()).toBeVisible();
});

const ADMIN_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

async function roleIdNamed(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get(`${ADMIN_API_BASE}/tenants/roles`);
  const { roles } = (await response.json()) as { roles: { id: string; name: string }[] };
  const match = roles.find((role) => role.name === name);
  expect(match, `no role named "${name}"`).toBeDefined();
  return match!.id;
}

test("refuses a second account on an email that is already taken", async ({ request }) => {
  const email = `e2e-duplicate-${Date.now()}@example.com`;
  const roleId = await roleIdNamed(request, "Associate");

  const first = await request.post(`${ADMIN_API_BASE}/admin/users`, {
    data: { name: "E2E Duplicate One", email, roleId, password: "E2eDuplicate123!" },
  });
  expect(first.ok()).toBeTruthy();

  const second = await request.post(`${ADMIN_API_BASE}/admin/users`, {
    data: { name: "E2E Duplicate Two", email, roleId, password: "E2eDuplicate123!" },
  });

  expect(second.status()).toBe(409);
});

test("refuses a user on a role this workspace does not own", async ({ request }) => {
  const response = await request.post(`${ADMIN_API_BASE}/admin/users`, {
    data: {
      name: "E2E No Such Role",
      email: `e2e-no-role-${Date.now()}@example.com`,
      roleId: "does-not-exist",
      password: "E2eNoRole123!",
    },
  });

  expect(response.status()).toBe(404);
});

test("refuses a user whose email is malformed", async ({ request }) => {
  const roleId = await roleIdNamed(request, "Associate");
  const response = await request.post(`${ADMIN_API_BASE}/admin/users`, {
    data: { name: "E2E Bad Email", email: "not-an-email", roleId, password: "E2eBadEmail123!" },
  });

  expect(response.status()).toBe(422);
});

test("turns AI off for the workspace and back on", async ({ request }) => {
  const disabled = await request.patch(`${ADMIN_API_BASE}/admin/ai/settings`, {
    data: { disabled: true, reason: "E2E toggle" },
  });
  expect(disabled.ok()).toBeTruthy();

  const settings = await request.get(`${ADMIN_API_BASE}/admin/ai/settings`);
  expect(settings.status()).toBe(200);

  const restored = await request.patch(`${ADMIN_API_BASE}/admin/ai/settings`, {
    data: { disabled: false },
  });
  expect(restored.ok()).toBeTruthy();
});

test("refuses an AI setting that is not a boolean", async ({ request }) => {
  const response = await request.patch(`${ADMIN_API_BASE}/admin/ai/settings`, {
    data: { disabled: "yes" },
  });

  expect(response.status()).toBe(422);
});
