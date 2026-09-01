import { test, expect } from "@playwright/test";

/**
 * The sign-in critical flow. Runs in the `unauthenticated` project (no storageState) — every
 * other spec reuses the session `e2e/fixtures/auth.setup.ts` already established.
 */
test("signs in with the seeded Owner's credentials and reaches the dashboard", async ({ page }) => {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@desta.local";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});

test("rejects the wrong password", async ({ page }) => {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@desta.local";

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/sign in failed|invalid/i)).toBeVisible();
});
