import { test, expect } from "@playwright/test";
import { createUser } from "./fixtures/api";

/**
 * Admin is gated `manageUsers` — Owner/Admin only (`apps/web/src/app/(app)/admin/page.tsx`). Every
 * other spec runs as the seeded Owner, so this is the only coverage that a non-admin role is
 * actually blocked server-side rather than just hidden from nav. Signs in as a fresh Associate
 * account in its own browser context — the shared `chromium` project's `storageState` is the
 * Owner's session (`playwright.config.ts`), so this can't reuse `page`/`request` for the sign-in
 * half without clobbering that session for later tests in the same worker.
 *
 * `browser.newContext()` inherits the project's configured `storageState` as a default (it is NOT
 * a clean slate the way a fresh `chromium.launch()` would be) — pass `storageState: undefined`
 * explicitly or this "fresh" context opens already signed in as the Owner.
 */
test("blocks a non-admin role from the admin console", async ({ request, browser }) => {
  const email = `e2e-associate-${Date.now()}@example.com`;
  const password = "E2eAssociate123!";
  await createUser(request, `E2E Associate ${Date.now()}`, email, "Associate", password);

  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/admin");
  await expect(page.getByText("You don't have access")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Users" })).not.toBeVisible();

  await context.close();
});
