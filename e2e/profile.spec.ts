import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

test("the profile page shows the signed-in user's own details", async ({ page }) => {
  await gotoReady(page, "/profile");

  await expect(page.getByRole("heading", { name: "My Profile", level: 1 })).toBeVisible();
  await expect(page.getByText(process.env["SEED_OWNER_EMAIL"] ?? "owner@e2e.local")).toBeVisible();
});
