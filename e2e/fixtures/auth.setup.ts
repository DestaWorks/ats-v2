import { test as setup, expect } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/owner.json";

/**
 * Logs in once via the real UI against the seeded Owner and saves the session for every other
 * spec (see `playwright.config.ts`'s `chromium` project). `sign-in.spec.ts` exercises the login
 * form itself and deliberately does NOT depend on this — it runs unauthenticated.
 */
setup("authenticate as the seeded Owner", async ({ page }) => {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@desta.local";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: STORAGE_STATE });
});
