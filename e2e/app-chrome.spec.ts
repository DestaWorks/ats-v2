import { test, expect } from "@playwright/test";
import { gotoReady } from "./fixtures/navigate";
import { createUser } from "./fixtures/api";

/**
 * The shell every screen renders inside: the nav, the account menu, the alerts bell. Nothing
 * covered it, and the nav is capability gated server side — so this is the UI counterpart to
 * `permission-gates.spec.ts`, which proves the same thing at the API.
 */

test("navigates by clicking the nav rather than by URL", async ({ page }) => {
  await gotoReady(page, "/dashboard");

  const nav = page.getByRole("navigation");
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Pipeline", exact: true }).click();

  await expect(page).toHaveURL(/\/pipeline/);
  await expect(page.getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible();
});

test("keeps capability gated destinations out of the nav for a role without them", async ({
  browser,
  request,
}) => {
  const stamp = Date.now();
  const email = `e2e-chrome-assoc-${stamp}@example.com`;
  const password = "E2eChrome123!";
  await createUser(request, `E2E Chrome Associate ${stamp}`, email, "Associate", password);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await gotoReady(page, "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: "Pipeline", exact: true })).toBeVisible();
  // An Associate holds no capabilities, so every gated destination must be absent — not merely
  // unreachable. A link that 403s on click is a worse answer than no link.
  for (const gated of ["CRM", "Activity", "Credentials", "Import"]) {
    await expect(nav.getByRole("link", { name: gated, exact: true })).toHaveCount(0);
  }
  await context.close();
});

test("opens the account menu and signs out through it", async ({ browser, request }) => {
  const stamp = Date.now();
  const email = `e2e-chrome-signout-${stamp}@example.com`;
  const password = "E2eSignOut123!";
  await createUser(request, `E2E Chrome SignOut ${stamp}`, email, "Associate", password);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await gotoReady(page, "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Two controls carry aria-haspopup="menu" in the header; the account one carries the name.
  const trigger = page
    .locator('button[aria-haspopup="menu"]')
    .filter({ hasText: `E2E Chrome SignOut ${stamp}` });
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(async () => {
    await trigger.click();
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await menu.getByRole("menuitem", { name: /Sign out/i }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  // The session must actually be gone, not just the page swapped.
  await gotoReady(page, "/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await context.close();
});

test("renders the alerts control in the header", async ({ page }) => {
  await gotoReady(page, "/dashboard");

  // The unread badge only renders above zero, so the control itself is what is always present.
  await expect(page.getByText("Alerts", { exact: true }).first()).toBeVisible();
});
