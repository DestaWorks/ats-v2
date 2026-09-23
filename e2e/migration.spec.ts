import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

test("bulk import loads for a role that holds the capability", async ({ page }) => {
  await gotoReady(page, "/migration");

  await expect(page.getByRole("heading", { name: /Bulk Import/i, level: 1 })).toBeVisible();
  await expect(page.getByText("You don't have access")).not.toBeVisible();
});
