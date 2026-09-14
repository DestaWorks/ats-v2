import { test, expect } from "@playwright/test";
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
