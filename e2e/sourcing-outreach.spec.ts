import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

/**
 * Source lead outreach: add a lead, log an outreach attempt, mark it responded Hot
 * (`apps/web/src/app/(app)/sourcing/add-lead-modal.tsx`, `lead-row.tsx`). A fresh lead
 * (`Sourced`) allows both — `canLogOutreach`/`canRespond` in
 * `packages/domain/src/rules/lead-lifecycle.ts` only block a `Promoted` lead.
 */
test("adds a lead, logs outreach, and marks it responded hot", async ({ page }) => {
  const name = `E2E Outreach Lead ${Date.now()}`;

  await gotoReady(page, "/sourcing");
  await page.getByRole("button", { name: "+ Add lead" }).click();
  await page.getByLabel(/^Name\*?$/).fill(name);
  await page.getByRole("button", { name: "Add Lead", exact: true }).click();

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Log" }).click();
  await page.getByRole("button", { name: "Log outreach", exact: true }).click();
  await expect(row.getByText("Outreach 1")).toBeVisible();

  // The row itself toggles the expanded detail panel; click the name cell, not an action button
  // (those stop propagation — `lead-row.tsx`'s `stop` handler on the actions `<Td>`).
  await row.getByText(name).click();
  // The expanded detail renders as its OWN <tr>, so it is a sibling of the row rather than inside
  // it; `?search=` narrows the page to this lead, which keeps the page-scoped locator unambiguous.
  await page.getByRole("button", { name: "Hot" }).click();
  await expect(page.getByText("Responded — Hot").first()).toBeVisible();
});
