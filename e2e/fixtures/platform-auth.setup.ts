import { test as setup, expect } from "@playwright/test";
import { gotoReady } from "./navigate";

export const PLATFORM_STORAGE_STATE = "e2e/.auth/platform.json";

const ADMIN_BASE_URL = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;

/**
 * Signs in to the platform console ONCE and saves the session cookie for every other platform
 * console spec (see `platform-console-*` projects in `playwright.config.ts`).
 *
 * This is deliberately a SEPARATE storage state file from the operator app's `owner.json`. The
 * console uses its own Better Auth instance (`desta-platform` cookie), and the two sessions are
 * independent by design — this setup must not reuse `e2e/.auth/owner.json`.
 *
 * `PLATFORM_ADMIN_USER_IDS` must include the seeded Owner's user id or the sign-in will succeed
 * but the console layout will render a "Not a platform administrator" refusal. That env var is set
 * on the admin webServer entry in `playwright.config.ts`.
 */
setup("sign in to the platform console", async ({ page }) => {
  const email = process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local";
  const password = process.env["SEED_OWNER_PASSWORD"] ?? "ChangeMe123!";

  await gotoReady(page, `${ADMIN_BASE_URL}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${ADMIN_BASE_URL}/tenants`);

  await page.context().storageState({ path: PLATFORM_STORAGE_STATE });
});
