import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createUser } from "./fixtures/api";

/**
 * Admin panel account lifecycle (`apps/web/src/app/(app)/admin/users-tab.tsx`) — everything
 * `admin-user.spec.ts` (add a user) and `admin-access-blocked.spec.ts` (role-gated console
 * access) don't already cover: changing a user's role, blocking/unblocking, resetting a
 * password, and removing the account. All four actions ride the same row, so one test walks
 * the whole lifecycle in order rather than re-navigating to `/admin` per action.
 *
 * Reset password and Remove both go through a native `window.confirm` — Playwright blocks on an
 * unhandled dialog, so `page.on("dialog", ...)` is wired up once for the whole test.
 */
test("changes a user's role, blocks/unblocks, resets their password, and removes them", async ({
  page,
  request,
}) => {
  const email = `e2e-lifecycle-${Date.now()}@example.com`;
  await createUser(request, `E2E Lifecycle ${Date.now()}`, email, "Associate", "E2eLifecycle123!");

  page.on("dialog", (dialog) => void dialog.accept());

  await gotoReady(page, "/admin");
  const row = page.getByRole("row").filter({ hasText: email });

  // Role change
  await row.getByRole("combobox").selectOption("Manager");
  await expect(page.getByText(`is now Manager`)).toBeVisible();
  // Option VALUES are `access_roles` ids now, not role names — assert the selected label.
  await expect(row.getByRole("combobox").locator("option:checked")).toHaveText("Manager");

  // Block
  await row.getByRole("button", { name: "Block", exact: true }).click();
  await page.getByLabel("Reason (optional)").fill("E2E test block");
  await page.getByRole("button", { name: "Block User", exact: true }).click();
  await expect(row.getByText("Blocked: E2E test block")).toBeVisible();

  // Unblock
  await row.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();

  // Reset password
  await row.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByText(`Password for`)).toBeVisible();
  await expect(page.locator("code")).toBeVisible();

  // Remove
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toHaveCount(0);
});

/**
 * The acting admin can't lock themselves out — `users-tab.tsx` disables Block/Remove on the row
 * matching `currentUserId`. Every other spec runs as the seeded Owner, so that account's own row
 * is the one under test here.
 */
test("disables blocking and removing your own account", async ({ page }) => {
  const ownerEmail = process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local";

  await gotoReady(page, "/admin");
  const row = page.getByRole("row").filter({ hasText: ownerEmail });

  await expect(row.getByRole("button", { name: "Block", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toBeDisabled();
});

const LIFECYCLE_API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";
const LIFECYCLE_WEB_BASE = "http://localhost:3007";

async function signInStatus(email: string, password: string): Promise<number> {
  const context = await playwrightRequest.newContext();
  const response = await context.post(`${LIFECYCLE_WEB_BASE}/api/auth/sign-in/email`, {
    data: { email, password },
    headers: { origin: LIFECYCLE_WEB_BASE },
  });
  const status = response.status();
  await context.dispose();
  return status;
}

async function userIdFor(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.get(`${LIFECYCLE_API_BASE}/admin/users`);
  const { users } = (await response.json()) as { users: { id: string; email: string }[] };
  const match = users.find((user) => user.email === email);
  expect(match, `no user with email ${email}`).toBeDefined();
  return match!.id;
}

test("blocks a banned account at sign-in and restores it on unban", async ({ request }) => {
  const stamp = Date.now();
  const email = `e2e-ban-${stamp}@example.com`;
  const password = "E2eBanned123!";
  await createUser(request, `E2E Ban ${stamp}`, email, "Associate", password);

  expect(await signInStatus(email, password), "the account signs in before the ban").toBe(200);

  const userId = await userIdFor(request, email);
  const banned = await request.post(`${LIFECYCLE_API_BASE}/admin/users/${userId}/ban`, {
    data: { reason: "E2E ban" },
  });
  expect(banned.ok()).toBeTruthy();

  expect(await signInStatus(email, password), "a banned account cannot sign in").not.toBe(200);

  const unbanned = await request.post(`${LIFECYCLE_API_BASE}/admin/users/${userId}/unban`);
  expect(unbanned.ok()).toBeTruthy();

  expect(await signInStatus(email, password), "unbanning restores sign-in").toBe(200);
});

test("refuses banning an account this workspace does not hold", async ({ request }) => {
  const response = await request.post(`${LIFECYCLE_API_BASE}/admin/users/does-not-exist/ban`, {
    data: { reason: "E2E missing account" },
  });

  expect(response.status()).toBe(404);
});

test("refuses banning or removing your own account", async ({ request }) => {
  const me = await request.get(`${LIFECYCLE_API_BASE}/me`);
  const { id } = (await me.json()) as { id: string };

  const banned = await request.post(`${LIFECYCLE_API_BASE}/admin/users/${id}/ban`, {
    data: { reason: "E2E self ban" },
  });
  expect(banned.status()).toBe(409);

  const removed = await request.delete(`${LIFECYCLE_API_BASE}/admin/users/${id}`);
  expect(removed.status()).toBe(409);

  const stillThere = await request.get(`${LIFECYCLE_API_BASE}/admin/users`);
  const { users } = (await stillThere.json()) as { users: { id: string; banned?: boolean }[] };
  expect(users.find((u) => u.id === id)?.banned).toBeFalsy();
});
