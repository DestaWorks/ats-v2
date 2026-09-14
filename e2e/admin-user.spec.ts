import { test, expect } from "@playwright/test";

/**
 * Admin — add a user (`apps/web/src/app/(app)/admin/users-tab.tsx`). Password is left blank
 * (the form auto-generates one); the modal closes and the new row lands in the table on success.
 */
test("adds a user from the admin panel", async ({ page }) => {
  const email = `e2e-user-${Date.now()}@example.com`;

  await page.goto("/admin");
  await page.getByRole("tab", { name: "Users" }).click();
  await page.getByRole("button", { name: "+ Add User" }).click();
  await page.getByLabel("Name", { exact: true }).fill(`E2E User ${Date.now()}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Add User", exact: true }).click();

  await expect(page.getByText(email)).toBeVisible();
});
