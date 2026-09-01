import { test, expect } from "@playwright/test";

/**
 * Client Discovery prospecting: add a prospect, change its status
 * (`apps/web/src/app/(app)/client-discovery/add-prospect-modal.tsx`, `prospect-row.tsx`). A
 * fresh prospect always starts at "Fresh Lead" (the service forces it regardless of what's sent).
 */
test("adds a prospect and changes its status", async ({ page }) => {
  const practiceName = `E2E Prospect ${Date.now()}`;

  await page.goto("/client-discovery");
  await page.getByRole("button", { name: "+ Add prospect" }).click();
  await page.getByLabel("Practice name").fill(practiceName);
  // exact: true — "+ Add prospect" (the trigger) substring-matches "Add Prospect" too.
  await page.getByRole("button", { name: "Add Prospect", exact: true }).click();

  const row = page.getByRole("row").filter({ hasText: practiceName });
  const statusSelect = row.getByLabel("Status");
  await expect(statusSelect).toHaveValue("Fresh Lead");

  await statusSelect.selectOption("Researched");
  await expect(statusSelect).toHaveValue("Researched");
});
