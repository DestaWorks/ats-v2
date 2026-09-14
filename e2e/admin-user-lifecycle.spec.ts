import { test, expect } from "@playwright/test";
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

  await page.goto("/admin");
  await page.getByRole("tab", { name: "Users" }).click();
  const row = page.getByRole("row").filter({ hasText: email });

  // Role change
  await row.getByRole("combobox").selectOption("Manager");
  await expect(page.getByText(`is now Manager`)).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveValue("Manager");

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

  await page.goto("/admin");
  await page.getByRole("tab", { name: "Users" }).click();
  const row = page.getByRole("row").filter({ hasText: ownerEmail });

  await expect(row.getByRole("button", { name: "Block", exact: true })).toBeDisabled();
  await expect(row.getByRole("button", { name: "Remove", exact: true })).toBeDisabled();
});
