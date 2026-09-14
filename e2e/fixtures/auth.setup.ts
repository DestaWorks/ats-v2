import { test as setup, expect } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/owner.json";
const API_BASE_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3004";

/**
 * Logs in once via the real UI against the seeded Owner and saves the session for every other
 * spec (see `playwright.config.ts`'s `chromium` project). `sign-in.spec.ts` exercises the login
 * form itself and deliberately does NOT depend on this — it runs unauthenticated.
 *
 * The seeded Owner holds an active membership in more than one workspace, so a session alone
 * leaves the tenant claim AMBIGUOUS and `requireUser` answers 401 to every authenticated call.
 * Switching here is what makes the saved state usable; the server sets `dw_tenant` from the
 * membership it verified, so the cookie is still never client-written.
 */
setup("authenticate as the seeded Owner", async ({ page }) => {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@desta.local";
  const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const tenant = process.env.SEED_TENANT_SLUG ?? "destaworks";

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|choose-workspace)/);

  const switched = await page.request.post(`${API_BASE_URL}/tenants/switch`, { data: { tenant } });
  expect(
    switched.ok(),
    `workspace switch to "${tenant}" failed: ${switched.status()} ${await switched.text()}`,
  ).toBe(true);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: STORAGE_STATE });
});
