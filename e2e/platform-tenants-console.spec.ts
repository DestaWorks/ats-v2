import { test, expect } from "@playwright/test";

/**
 * The platform-admin plane's tenants console (`apps/admin`), the third of the three flows that
 * needed a second tenant to exist — see `workspace-switching.spec.ts` for the other two.
 *
 * Runs against `apps/admin`'s own dev server (`playwright.config.ts`, port 3008), not the
 * `baseURL` used everywhere else in this project — absolute URLs throughout. The seeded default
 * Owner (`e2e/fixtures/auth.setup.ts`'s storage state, reused here) is granted the platform-admin
 * plane in CI by `PLATFORM_ADMIN_USER_IDS` (`.github/workflows/ci.yml`'s `e2e` job, set from
 * `scripts/print-user-id.ts`'s output) — Better Auth's session cookie is host-only, not
 * port-scoped, so the same signed-in session that works against `apps/web` on 3007 is honored by
 * `apps/admin` on 3008 without a separate sign-in.
 *
 * Does not test suspend/restore: `apps/admin/src/app/(console)/tenants/[slug]/page.tsx` renders a
 * `NotBuiltYet` placeholder for that action — there is nothing there to click yet.
 */

const TENANT_B_SLUG = process.env["SEED_TENANT_B_SLUG"] ?? "e2e-tenant-b";
const TENANT_B_NAME = process.env["SEED_TENANT_B_NAME"] ?? "E2E Second Workspace";

test("lists both tenants and shows a workspace's detail", async ({ page }) => {
  await page.goto("http://localhost:3008/tenants");
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();

  const table = page.getByRole("table", { name: "Tenants on this installation" });
  const tenantBRow = table.getByRole("row").filter({ hasText: TENANT_B_NAME });
  await expect(tenantBRow).toBeVisible();
  await expect(tenantBRow.getByText(TENANT_B_SLUG)).toBeVisible();
  await expect(tenantBRow.getByText("active", { exact: true })).toBeVisible();

  await tenantBRow.getByRole("link", { name: TENANT_B_NAME }).click();
  await expect(page).toHaveURL(`http://localhost:3008/tenants/${TENANT_B_SLUG}`);
  await expect(page.getByRole("heading", { name: TENANT_B_NAME })).toBeVisible();
  await expect(page.getByText("Slug").locator("..").getByText(TENANT_B_SLUG)).toBeVisible();
  await expect(page.getByText("Members").locator("..").getByText(/^\d+$/)).toBeVisible();
});
