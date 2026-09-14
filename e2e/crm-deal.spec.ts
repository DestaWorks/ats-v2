import { test, expect } from "@playwright/test";
import { createClient } from "./fixtures/api";

/**
 * CRM deal lifecycle: create → move through an open stage → close won
 * (`apps/web/src/app/(app)/crm/[id]/deals-tab.tsx`, `deal-detail-modal.tsx`). The stage
 * `<select>` has no accessible label (a real gap — `deal-detail-modal.tsx:199-200` — flagged, not
 * fixed here), so it's targeted by scoping to the deal modal (a native `<dialog>`, implicit
 * `role="dialog"`) rather than by label.
 */
test("creates a deal, moves its stage, and closes it won", async ({ page, request }) => {
  const clientId = await createClient(request, `E2E Deal Client ${Date.now()}`);
  const dealName = `E2E Deal ${Date.now()}`;

  await page.goto(`/crm/${clientId}`);
  await page.getByRole("tab", { name: "Deals" }).click();
  await page.getByRole("button", { name: "+ Add Deal" }).click();
  await page.getByLabel("Name", { exact: true }).fill(dealName);
  await page.getByRole("button", { name: "Add Deal", exact: true }).click();

  await page.getByRole("button", { name: new RegExp(dealName) }).click();
  const dialog = page.getByRole("dialog");
  const stageSelect = dialog.locator("select");

  // Moving to an open stage PATCHes immediately.
  await stageSelect.selectOption("Contacted");
  await expect(stageSelect).toHaveValue("Contacted");

  // Selecting a closed stage opens the close panel instead of PATCHing directly
  // (`moveStage` in deal-detail-modal.tsx).
  await stageSelect.selectOption("Signed");
  await dialog.getByLabel("Reason").fill("Signed after a strong final call");
  await dialog.getByRole("button", { name: "Mark Won" }).click();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Closed Deals")).toBeVisible();
  await expect(page.getByText(dealName)).toBeVisible();
  await expect(page.getByText("Won")).toBeVisible();
});
