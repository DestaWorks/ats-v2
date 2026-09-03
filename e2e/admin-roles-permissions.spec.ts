import { test, expect } from "@playwright/test";

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
  await page.goto("/admin");
  await page.getByRole("tab", { name: "Roles" }).click();

  await expect(page.getByRole("heading", { name: "Role Management" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Permission Matrix" })).toBeVisible();

  // The seeded Owner always has at least one member in the Owner role card.
  const ownerCard = page
    .locator('div[style*="border-left"]')
    .filter({ has: page.getByText("Owner", { exact: true }) });
  await expect(ownerCard).toBeVisible();
  await expect(ownerCard.getByText(/\d+ users?/)).toBeVisible();

  // manageUsers: an admin-only capability — granted to Owner/Admin, not Associate.
  const manageUsersRow = page.getByRole("row", { name: "manageUsers" });
  await expect(manageUsersRow.locator("td").nth(1)).toHaveText("✓"); // Owner
  await expect(manageUsersRow.locator("td").nth(6)).toHaveText("✓"); // Admin
  await expect(manageUsersRow.locator("td").nth(4)).toHaveText("—"); // Screener
  await expect(manageUsersRow.locator("td").nth(5)).toHaveText("—"); // Associate

  // viewReports: a leadership capability — granted to Director/Manager too, not Screener/Associate.
  const viewReportsRow = page.getByRole("row", { name: "viewReports" });
  await expect(viewReportsRow.locator("td").nth(2)).toHaveText("✓"); // Director
  await expect(viewReportsRow.locator("td").nth(3)).toHaveText("✓"); // Manager
  await expect(viewReportsRow.locator("td").nth(4)).toHaveText("—"); // Screener
  await expect(viewReportsRow.locator("td").nth(5)).toHaveText("—"); // Associate
});
