import { test, expect, type Page } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

const ADMIN_BASE_URL = `http://localhost:${process.env["ADMIN_PORT"] ?? "3008"}`;

/**
 * The platform-admin plane's tenants console (`apps/admin`), the third of the three flows that
 * needed a second tenant to exist — see `workspace-switching.spec.ts` for the other two.
 *
 * Runs against `apps/admin`'s own dev server (`playwright.config.ts`, port 3008), not the
 * `baseURL` used everywhere else in this project — absolute URLs throughout.
 *
 * The console holds its OWN session, under its own cookie, so the storage state from
 * `auth.setup.ts` does not reach it and this signs in separately. That separation is deliberate:
 * an operator must be able to inspect a workspace as a tenant user AND operate the installation at
 * the same time, which one shared cookie makes impossible. `PLATFORM_ADMIN_USER_IDS` still decides
 * whether the account may do anything once signed in.
 *
 * Does not test suspend/restore: `apps/admin/src/app/(console)/tenants/[slug]/page.tsx` renders a
 * `NotBuiltYet` placeholder for that action — there is nothing there to click yet.
 */

const TENANT_B_SLUG = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";

/** Sign in at the CONSOLE — its cookie is separate from the operator app's by design. */
async function signInToConsole(page: Page): Promise<void> {
  await gotoReady(page, `${ADMIN_BASE_URL}/sign-in`);
  await page.getByLabel("Email").fill(process.env["SEED_OWNER_EMAIL"] ?? "owner@desta.local");
  await page.getByLabel("Password").fill(process.env["SEED_OWNER_PASSWORD"] ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${ADMIN_BASE_URL}/tenants`);
}

test("lists both tenants and shows a workspace's detail", async ({ page }) => {
  await signInToConsole(page);
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();

  const table = page.getByRole("table", { name: "Tenants on this installation" });
  const tenantBRow = table.getByRole("row").filter({ hasText: TENANT_B_NAME });
  await expect(tenantBRow).toBeVisible();
  await expect(tenantBRow.getByText(TENANT_B_SLUG)).toBeVisible();
  await expect(tenantBRow.getByText("active", { exact: true })).toBeVisible();

  await tenantBRow.getByRole("link", { name: TENANT_B_NAME }).click();
  await expect(page).toHaveURL(`${ADMIN_BASE_URL}/tenants/${TENANT_B_SLUG}`);
  await expect(page.getByRole("heading", { name: TENANT_B_NAME })).toBeVisible();
  await expect(page.getByText("Slug").locator("..").getByText(TENANT_B_SLUG)).toBeVisible();
  await expect(page.getByText("Members").locator("..").getByText(/^\d+$/)).toBeVisible();
});
