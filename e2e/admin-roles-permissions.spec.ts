import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Roles tab (`apps/web/src/app/(app)/admin/roles-tab.tsx`) — role membership cards and the
 * read-only permission matrix, driven entirely by `ROLE_CAPABILITIES`
 * (`packages/domain/src/constants/roles.ts`). Neither surface has any prior E2E coverage;
 * `admin-user.spec.ts`/`admin-access-blocked.spec.ts` only cover the Users tab and console gating.
 *
 * Assertions are anchored to the actual capability table rather than the exact seeded user count,
 * since other specs create fixture accounts and this suite doesn't reset the database between runs.
 */
test("shows role membership counts and the permission matrix", async ({ page }) => {
  await gotoReady(page, "/admin");
  await page.getByRole("button", { name: /\d+ Roles$/ }).click();

  await expect(page.getByRole("heading", { name: "Role Management" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Permission Matrix" })).toBeVisible();

  // The seeded Owner always has at least one member in the Owner role card.
  const ownerCard = page
    .locator('div[style*="border-left"]')
    .filter({ has: page.getByText("Owner", { exact: true }) });
  await expect(ownerCard).toBeVisible();
  await expect(ownerCard.getByText(/\d+ users?/)).toBeVisible();

  // Columns come from the workspace's OWN `access_roles` rows, so their order is whatever the
  // API returns — resolve each role's column by its header rather than pinning an index.
  const grant = async (capability: string, role: string) => {
    const headers = page.locator("thead th");
    const names = await headers.allTextContents();
    const column = names.findIndex((name) => name.trim() === role);
    expect(column, `no column headed "${role}"`).toBeGreaterThan(0);
    return page.getByRole("row", { name: capability }).locator("td").nth(column);
  };

  await expect(await grant("manageUsers", "Owner")).toHaveText("✓");
  await expect(await grant("manageUsers", "Admin")).toHaveText("✓");
  await expect(await grant("manageUsers", "Screener")).toHaveText("—");
  await expect(await grant("manageUsers", "Associate")).toHaveText("—");

  await expect(await grant("viewReports", "Director")).toHaveText("✓");
  await expect(await grant("viewReports", "Manager")).toHaveText("✓");
  await expect(await grant("viewReports", "Screener")).toHaveText("—");
  await expect(await grant("viewReports", "Associate")).toHaveText("—");
});
