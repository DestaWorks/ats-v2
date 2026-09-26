import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";

test("the profile page shows the signed-in user's own details", async ({ page }) => {
  await gotoReady(page, "/profile");

  await expect(page.getByRole("heading", { name: "My Profile", level: 1 })).toBeVisible();
  await expect(page.getByText(process.env["SEED_OWNER_EMAIL"] ?? "owner@e2e.local")).toBeVisible();
});

const signatureCard = (page: import("@playwright/test").Page) =>
  page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Email Signature" }) })
    .filter({ has: page.getByRole("textbox") })
    .last();

test("keeps an edited email signature after a reload", async ({ page }) => {
  const signature = `E2E Signature ${Date.now()}`;

  await gotoReady(page, "/profile");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/me/preferences") && response.request().method() === "PATCH",
  );
  await signatureCard(page).getByRole("textbox").fill(signature);
  expect((await saved).ok(), "the debounced autosave reaches the API").toBeTruthy();

  await gotoReady(page, "/profile");
  await expect(signatureCard(page).getByRole("textbox")).toHaveValue(signature);
});
