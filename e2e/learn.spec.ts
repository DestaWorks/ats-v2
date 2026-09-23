import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

test("the learn page loads and lists its chapters", async ({ page }) => {
  await gotoReady(page, "/learn");

  await expect(page.getByRole("heading", { name: /Learn the system/i, level: 1 })).toBeVisible();
  await expect(page.getByText("Your First 60 Seconds")).toBeVisible();
});
